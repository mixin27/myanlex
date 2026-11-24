import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  billingContacts,
  createInvoice,
} from '../src/infrastructure/database/billing-invoices.js';
import {
  PrismaBillingProfileRepository,
  hashBillingEmailToken,
} from '../src/infrastructure/database/prisma-billing-profile.repository.js';
import { PrismaUsageLedgerRepository } from '../src/infrastructure/database/prisma-usage-ledger.repository.js';
import { BillingProfileError } from '../src/modules/platform/billing-profile.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('Billing details on PostgreSQL', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const profiles = new PrismaBillingProfileRepository(databaseUrl!);
  const ledger = new PrismaUsageLedgerRepository(databaseUrl!);
  afterAll(async () => {
    await Promise.all([
      client.$disconnect(),
      profiles.onApplicationShutdown(),
      ledger.onApplicationShutdown(),
    ]);
  });

  /** A workspace with an Owner who can manage billing. */
  async function workspace() {
    const organization = await client.organization.create({
      data: { name: 'Lotus Media', slug: `bp-${randomUUID()}` },
    });
    const user = await client.user.create({
      data: {
        name: 'Owner',
        email: `owner-${randomUUID()}@example.test`,
        emailVerified: true,
      },
    });
    const manage = await client.permission.upsert({
      where: { key: 'billing.manage' },
      update: {},
      create: { key: 'billing.manage', description: 'Change plans' },
    });
    const role = await client.role.create({
      data: {
        organizationId: organization.id,
        name: 'Owner',
        slug: 'owner',
        system: true,
        permissions: { create: [{ permissionId: manage.id }] },
      },
    });
    await client.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        roleId: role.id,
      },
    });
    return { organization, actor: { userId: user.id, email: user.email } };
  }

  const issue = (organizationId: string) =>
    client.$transaction((tx) =>
      createInvoice(tx, {
        organizationId,
        kind: 'proration',
        periodStart: new Date('2026-11-24T00:00:00Z'),
        periodEnd: new Date('2026-12-01T00:00:00Z'),
        currency: 'MMK',
        lines: [
          {
            kind: 'proration',
            description: 'Pro plan, 7 of 30 days in November 2026',
            quantity: 7n,
            unitMinor: 50_000n,
            amountMinor: 11_667n,
            planSlug: 'pro',
          },
        ],
        actorEmail: 'ops@example.test',
      }),
    );

  const audits = (organizationId: string) =>
    client.auditEvent.findMany({
      where: { organizationId, action: { startsWith: 'billing.' } },
      orderBy: { createdAt: 'asc' },
      select: { action: true, actorEmail: true, metadata: true },
    });

  it('saves, clears and audits bill-to details by changed field', async () => {
    const { organization, actor } = await workspace();
    const empty = await profiles.profile(organization.id);
    expect(empty).toEqual({
      details: {
        legalName: null,
        address: null,
        taxId: null,
        invoiceNote: null,
      },
      emails: [],
    });
    const saved = await profiles.updateDetails(organization.id, actor, {
      legalName: 'Lotus Media Co., Ltd.',
      address: 'No. 1, Pyay Road\nYangon',
      taxId: '123456789',
      invoiceNote: null,
    });
    expect(saved.details.legalName).toBe('Lotus Media Co., Ltd.');
    // Saving the same values again records nothing.
    await profiles.updateDetails(organization.id, actor, saved.details);
    await profiles.updateDetails(organization.id, actor, {
      ...saved.details,
      taxId: null,
      invoiceNote: 'PO 42',
    });
    expect(await audits(organization.id)).toEqual([
      {
        action: 'billing.profile_updated',
        actorEmail: actor.email,
        metadata: { fields: ['legalName', 'address', 'taxId'] },
      },
      {
        action: 'billing.profile_updated',
        actorEmail: actor.email,
        metadata: { fields: ['taxId', 'invoiceNote'] },
      },
    ]);
    await expect(
      client.billingProfile.update({
        where: { organizationId: organization.id },
        data: { legalName: '  ' },
      }),
    ).rejects.toThrow();
  });

  it('adds up to three lower-cased emails, refusing duplicates, under concurrency', async () => {
    const { organization, actor } = await workspace();
    const added = await profiles.addEmail(
      organization.id,
      actor,
      'Finance@Lotus.test',
    );
    expect(added.email).toMatchObject({
      email: 'finance@lotus.test',
      status: 'pending',
    });
    expect(added.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await client.billingEmail.findUniqueOrThrow({
      where: { id: added.email.id },
    });
    expect(stored.tokenHash).toBe(hashBillingEmailToken(added.token));
    await expect(
      profiles.addEmail(organization.id, actor, 'FINANCE@lotus.test'),
    ).rejects.toMatchObject({ code: 'duplicate_email' });
    const results = await Promise.allSettled(
      ['a', 'b', 'c', 'd'].map((name) =>
        profiles.addEmail(organization.id, actor, `${name}@lotus.test`),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    for (const result of results.filter((r) => r.status === 'rejected'))
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: 'email_limit',
      });
    expect(
      await client.billingEmail.count({
        where: { organizationId: organization.id },
      }),
    ).toBe(3);
  });

  it('confirms by token once, refusing expired, used and unknown tokens', async () => {
    const { organization, actor } = await workspace();
    const { email, token } = await profiles.addEmail(
      organization.id,
      actor,
      'ap@lotus.test',
    );
    await expect(profiles.confirmEmail('x'.repeat(43))).rejects.toMatchObject({
      code: 'invalid_or_expired',
    });
    expect(await profiles.confirmEmail(token)).toEqual({
      organizationName: 'Lotus Media',
      email: 'ap@lotus.test',
    });
    await expect(profiles.confirmEmail(token)).rejects.toBeInstanceOf(
      BillingProfileError,
    );
    const record = (await profiles.profile(organization.id)).emails[0]!;
    expect(record.status).toBe('confirmed');
    expect(record.verifiedAt).toBeInstanceOf(Date);
    await expect(
      profiles.resendEmail(organization.id, email.id),
    ).rejects.toMatchObject({ code: 'already_confirmed' });
    // The mailbox holder, not a member, is the actor.
    expect((await audits(organization.id)).at(-1)).toEqual({
      action: 'billing.email_confirmed',
      actorEmail: 'ap@lotus.test',
      metadata: { email: 'ap@lotus.test' },
    });

    const late = await profiles.addEmail(
      organization.id,
      actor,
      'late@lotus.test',
    );
    await client.billingEmail.update({
      where: { id: late.email.id },
      data: { tokenExpiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (await profiles.profile(organization.id)).emails.find(
        (row) => row.id === late.email.id,
      )?.status,
    ).toBe('expired');
    await expect(profiles.confirmEmail(late.token)).rejects.toMatchObject({
      code: 'invalid_or_expired',
    });
  });

  it('resends at most once a minute with a new token, and removes', async () => {
    const { organization, actor } = await workspace();
    const first = await profiles.addEmail(
      organization.id,
      actor,
      'x@lotus.test',
    );
    await expect(
      profiles.resendEmail(organization.id, first.email.id),
    ).rejects.toMatchObject({ code: 'too_soon' });
    await client.billingEmail.update({
      where: { id: first.email.id },
      data: {
        tokenExpiresAt: new Date(Date.now() + 7 * 86_400_000 - 120_000),
      },
    });
    const second = await profiles.resendEmail(organization.id, first.email.id);
    expect(second.token).not.toBe(first.token);
    await expect(profiles.confirmEmail(first.token)).rejects.toMatchObject({
      code: 'invalid_or_expired',
    });
    const other = await workspace();
    await expect(
      profiles.removeEmail(other.organization.id, other.actor, first.email.id),
    ).rejects.toMatchObject({ code: 'not_found' });
    await profiles.removeEmail(organization.id, actor, first.email.id);
    expect((await profiles.profile(organization.id)).emails).toEqual([]);
    expect((await audits(organization.id)).map((a) => a.action)).toEqual([
      'billing.email_added',
      'billing.email_removed',
    ]);
  });

  it('sends invoice mail to confirmed billing emails, else to managers', async () => {
    const { organization, actor } = await workspace();
    expect(await billingContacts(client, organization.id)).toEqual([
      actor.email,
    ]);
    await profiles.addEmail(organization.id, actor, 'pending@lotus.test');
    // Pending addresses never receive invoices.
    expect(await billingContacts(client, organization.id)).toEqual([
      actor.email,
    ]);
    const b = await profiles.addEmail(organization.id, actor, 'b@lotus.test');
    const a = await profiles.addEmail(organization.id, actor, 'a@lotus.test');
    await profiles.confirmEmail(b.token);
    await profiles.confirmEmail(a.token);
    expect(await billingContacts(client, organization.id)).toEqual([
      'a@lotus.test',
      'b@lotus.test',
    ]);
    await profiles.removeEmail(organization.id, actor, a.email.id);
    await profiles.removeEmail(organization.id, actor, b.email.id);
    expect(await billingContacts(client, organization.id)).toEqual([
      actor.email,
    ]);
  });

  it('keeps the bill-to of an issued invoice as it was, enforced by the database', async () => {
    const { organization, actor } = await workspace();
    const plain = await issue(organization.id);
    expect(plain.billTo).toEqual({
      name: 'Lotus Media',
      address: null,
      taxId: null,
      note: null,
    });
    await profiles.updateDetails(organization.id, actor, {
      legalName: 'Lotus Media Co., Ltd.',
      address: 'Yangon',
      taxId: '123',
      invoiceNote: 'PO 42',
    });
    const detailed = await issue(organization.id);
    expect(detailed.billTo).toEqual({
      name: 'Lotus Media Co., Ltd.',
      address: 'Yangon',
      taxId: '123',
      note: 'PO 42',
    });
    await profiles.updateDetails(organization.id, actor, {
      legalName: 'Renamed Ltd.',
      address: null,
      taxId: null,
      invoiceNote: null,
    });
    const shown = await ledger.invoice(organization.id, detailed.number);
    expect(shown?.billTo?.name).toBe('Lotus Media Co., Ltd.');
    await expect(
      client.invoice.update({
        where: { id: detailed.id },
        data: { billTo: { name: 'Edited' } },
      }),
    ).rejects.toThrow(/cannot change/);
  });
});
