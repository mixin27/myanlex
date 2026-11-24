import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PlanAdmin } from '../src/infrastructure/database/plan-admin.js';
import { InvoiceAdmin } from '../src/infrastructure/database/billing-invoices.js';
import { PrismaUsageLedgerRepository } from '../src/infrastructure/database/prisma-usage-ledger.repository.js';
import { readPlan } from '../src/infrastructure/database/prisma-quota.repository.js';
import {
  monthStartOf,
  nextMonthStartOf,
} from '../src/common/billing/invoicing.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;
const operator = 'ops@example.test';

describe.skipIf(!databaseUrl)('Invoices, payments and dunning', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const plans = new PlanAdmin(databaseUrl!);
  const invoices = new InvoiceAdmin(databaseUrl!);
  const ledger = new PrismaUsageLedgerRepository(databaseUrl!);
  afterAll(async () => {
    await Promise.all([
      client.$disconnect(),
      plans.close(),
      invoices.close(),
      ledger.onApplicationShutdown(),
    ]);
  });

  const definePlan = async (overrides: Record<string, unknown> = {}) => {
    const definition = {
      slug: `p-${randomUUID().slice(0, 8)}`,
      name: 'Pro',
      public: true,
      currency: 'MMK',
      baseFeeMinor: 50_000,
      monthlyRequestLimit: 200,
      monthlyCharacterLimit: null,
      overageMode: 'block',
      ...overrides,
    };
    await plans.upsert(definition);
    return definition;
  };

  /** A workspace with an Owner who can manage billing. */
  async function workspace() {
    const organization = await client.organization.create({
      data: { name: 'Lotus Media', slug: `inv-${randomUUID()}` },
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

  const now = new Date();
  const monthStart = monthStartOf(now);
  const midMonth = now.getUTCDate() !== 1;

  it('numbers invoices without gaps under concurrent issuing', async () => {
    const pro = await definePlan();
    const workspaces = await Promise.all(Array.from({ length: 6 }, workspace));
    for (const { organization } of workspaces)
      await client.subscription.create({
        data: {
          organizationId: organization.id,
          planId: (
            await client.plan.findUniqueOrThrow({ where: { slug: pro.slug } })
          ).id,
          status: 'active',
          startsAt: new Date('2020-01-01T00:00:00Z'),
        },
      });
    const runs = await Promise.all([
      invoices.issueMonthly(),
      invoices.issueMonthly(),
    ]);
    const issued = runs.flatMap((run) => run.issued);
    const ours = issued.filter((invoice) =>
      workspaces.some((ws) => ws.organization.id === invoice.organizationId),
    );
    // One invoice per workspace even though two runs raced.
    expect(new Set(ours.map((invoice) => invoice.organizationId)).size).toBe(6);
    expect(ours).toHaveLength(6);
    const year = now.getUTCFullYear();
    const all = await client.invoice.findMany({
      where: { number: { startsWith: `MLX-${year}-` } },
      select: { number: true },
    });
    const numbers = all
      .map((row) => Number(row.number.slice(-6)))
      .sort((a, b) => a - b);
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
    expect(ours[0]!.lines[0]).toMatchObject({
      kind: 'base_fee',
      amountMinor: 50_000n,
    });
    // Running again issues nothing new for these workspaces.
    const again = await invoices.issueMonthly();
    expect(
      again.issued.filter((invoice) =>
        workspaces.some((ws) => ws.organization.id === invoice.organizationId),
      ),
    ).toEqual([]);
  });

  it('adds closed-month overage and waits for an unclosed statement', async () => {
    const { organization } = await workspace();
    const previous = monthStartOf(new Date(monthStart.getTime() - 86_400_000));
    await client.organizationQuota.create({
      data: {
        organizationId: organization.id,
        monthStart: previous,
        requestCount: 5n,
        characterCount: 5n,
      },
    });
    let run = await invoices.issueMonthly();
    expect(run.waitingForStatement).toContain(organization.slug);
    await client.usageStatement.create({
      data: {
        organizationId: organization.id,
        monthStart: previous,
        requestCount: 5n,
        characterCount: 5n,
        eventCount: 5n,
        counterRequests: 5n,
        counterCharacters: 5n,
        reconciled: true,
        plan: {
          slug: 'free',
          name: 'Free',
          monthlyRequestLimit: '1',
          monthlyCharacterLimit: null,
        },
        breakdown: { lines: [] },
        charges: {
          currency: 'MMK',
          baseFeeMinor: '0',
          requests: {
            units: '4',
            blocks: '1',
            blockSize: '50',
            blockPriceMinor: '2500',
            amountMinor: '2500',
          },
          characters: {
            units: '0',
            blocks: '0',
            blockSize: '100000',
            blockPriceMinor: '0',
            amountMinor: '0',
          },
          totalMinor: '2500',
        },
      },
    });
    run = await invoices.issueMonthly();
    const mine = run.issued.filter(
      (invoice) => invoice.organizationId === organization.id,
    );
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      kind: 'monthly',
      totalMinor: 2_500n,
      currency: 'MMK',
    });
    expect(mine[0]!.lines.map((line) => line.kind)).toEqual([
      'request_overage',
    ]);
  });

  it('keeps issued invoices immutable and balanced', async () => {
    const pro = await definePlan();
    const { organization } = await workspace();
    await plans.assign({
      organizationSlug: organization.slug,
      planSlug: pro.slug,
      actorEmail: operator,
      startsAt: undefined,
    });
    await client.subscription.updateMany({
      where: { organizationId: organization.id },
      data: { startsAt: new Date('2020-01-01T00:00:00Z') },
    });
    const run = await invoices.issueMonthly();
    const invoice = run.issued.find(
      (row) => row.organizationId === organization.id,
    )!;
    await expect(
      client.invoice.update({
        where: { id: invoice.id },
        data: { totalMinor: 1n, subtotalMinor: 1n },
      }),
    ).rejects.toThrow();
    await expect(
      client.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          position: 9,
          kind: 'base_fee',
          description: 'extra',
          quantity: 1n,
          unitMinor: 1n,
          amountMinor: 1n,
          planSlug: pro.slug,
        },
      }),
    ).rejects.toThrow();
    await expect(
      client.invoice.delete({ where: { id: invoice.id } }),
    ).rejects.toThrow();
    await expect(
      invoices.void({
        invoiceNumber: invoice.number,
        reason: ' ',
        actorEmail: operator,
      }),
    ).rejects.toThrow('reason');
    const voided = await invoices.void({
      invoiceNumber: invoice.number,
      reason: 'Issued in error',
      actorEmail: operator,
    });
    expect(voided.status).toBe('void');
    await expect(
      invoices.recordPayment({
        invoiceNumber: invoice.number,
        method: 'bank_transfer',
        actorEmail: operator,
      }),
    ).rejects.toThrow('already void');
  });

  it.runIf(midMonth)(
    'invoices upgrades for the rest of the month and defers downgrades',
    async () => {
      const pro = await definePlan();
      const scale = await definePlan({ name: 'Scale', baseFeeMinor: 120_000 });
      const team = await definePlan({
        name: 'Team',
        currency: 'USD',
        baseFeeMinor: 4_900,
      });
      const { organization, actor } = await workspace();
      await plans.assign({
        organizationSlug: organization.slug,
        planSlug: pro.slug,
        actorEmail: operator,
      });

      // Downgrades, Free and currency changes can't start now.
      for (const planSlug of ['free', team.slug])
        await expect(
          ledger.requestPlanChange(organization.id, actor, {
            planSlug,
            timing: 'now',
          }),
        ).rejects.toMatchObject({ code: 'timing_not_allowed' });

      const upgrade = await ledger.requestPlanChange(organization.id, actor, {
        planSlug: scale.slug,
        timing: 'now',
      });
      const applied = await plans.approveChange({
        changeId: upgrade.id,
        actorEmail: operator,
      });
      expect(applied.invoice).not.toBeNull();
      const line = applied.invoice!.lines[0]!;
      expect(line).toMatchObject({ kind: 'proration', unitMinor: 70_000n });
      expect(applied.invoice!.kind).toBe('proration');
      expect(applied.invoice!.planChangeId).toBe(upgrade.id);

      // A downgrade requested for next month, approved late, waits for the 1st.
      const down = await ledger.requestPlanChange(organization.id, actor, {
        planSlug: pro.slug,
        timing: 'next_month',
      });
      await client.$executeRaw`
      UPDATE plan_changes SET requested_starts_at = now() - interval '1 hour'
      WHERE id = ${down.id}::uuid`;
      const deferred = await plans.approveChange({
        changeId: down.id,
        actorEmail: operator,
      });
      expect(deferred.invoice).toBeNull();
      expect(deferred.startsAt).toEqual(nextMonthStartOf(now));
      expect(deferred.startedEarly).toBe(true);
      const overview = await ledger.billing(organization.id);
      expect(overview.outstanding).toMatchObject([
        { currency: 'MMK', invoices: 1, overdue: false },
      ]);
      expect(
        overview.publicPlans.find((plan) => plan.slug === team.slug)?.change,
      ).toMatchObject({
        kind: 'currency',
        nowAllowed: false,
      });
    },
  );

  it('records full payments once, and provider references once', async () => {
    const pro = await definePlan();
    const { organization } = await workspace();
    await client.subscription.create({
      data: {
        organizationId: organization.id,
        planId: (
          await client.plan.findUniqueOrThrow({ where: { slug: pro.slug } })
        ).id,
        status: 'active',
        startsAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
    const invoice = (await invoices.issueMonthly()).issued.find(
      (row) => row.organizationId === organization.id,
    )!;
    await expect(
      invoices.recordPayment({
        invoiceNumber: invoice.number,
        method: 'bank_transfer',
        amountMinor: 1n,
        actorEmail: operator,
      }),
    ).rejects.toThrow('full');
    await expect(
      invoices.recordPayment({
        invoiceNumber: invoice.number,
        method: 'bank_transfer',
        currency: 'USD',
        actorEmail: operator,
      }),
    ).rejects.toThrow('MMK');
    const paid = await invoices.recordPayment({
      invoiceNumber: invoice.number,
      method: 'provider',
      provider: 'test',
      externalRef: `ref-${invoice.number}`,
      actorEmail: operator,
    });
    expect(paid.invoice).toMatchObject({ status: 'paid' });
    expect(paid.invoice.payments).toHaveLength(1);
    await expect(
      invoices.recordPayment({
        invoiceNumber: invoice.number,
        method: 'bank_transfer',
        actorEmail: operator,
      }),
    ).rejects.toThrow('already paid');
    // A provider callback replaying the same reference can't pay twice.
    await expect(
      client.payment.create({
        data: {
          invoiceId: invoice.id,
          method: 'provider',
          provider: 'test',
          externalRef: `ref-${invoice.number}`,
          amountMinor: 1n,
          currency: 'MMK',
          receivedAt: new Date(),
          recordedBy: operator,
        },
      }),
    ).rejects.toThrow();
  });

  it('reminds, moves overdue workspaces to Free, and restores the plan on payment', async () => {
    const pro = await definePlan();
    const { organization, actor } = await workspace();
    await client.subscription.create({
      data: {
        organizationId: organization.id,
        planId: (
          await client.plan.findUniqueOrThrow({ where: { slug: pro.slug } })
        ).id,
        status: 'active',
        startsAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
    const invoice = (await invoices.issueMonthly()).issued.find(
      (row) => row.organizationId === organization.id,
    )!;
    expect(await invoices.contacts(organization.id)).toEqual([actor.email]);
    let actions = await invoices.runDunning([invoice.id]);
    expect(actions.map((action) => [action.kind, action.reminder])).toEqual([
      ['reminder', 1],
    ]);
    expect(await invoices.runDunning([invoice.id])).toEqual([]);

    // Four days later: the day-3 reminder, once.
    await client.$executeRaw`ALTER TABLE invoices DISABLE TRIGGER invoices_guard`;
    await client.$executeRaw`
      UPDATE invoices SET issued_at = issued_at - interval '4 days', due_at = due_at - interval '4 days'
      WHERE id = ${invoice.id}::uuid`;
    await client.$executeRaw`ALTER TABLE invoices ENABLE TRIGGER invoices_guard`;
    actions = await invoices.runDunning([invoice.id]);
    expect(actions.map((action) => [action.kind, action.reminder])).toEqual([
      ['reminder', 2],
    ]);

    // Overdue: moved to Free once, remembering the plan.
    await client.$executeRaw`ALTER TABLE invoices DISABLE TRIGGER invoices_guard`;
    await client.$executeRaw`
      UPDATE invoices SET issued_at = issued_at - interval '4 days', due_at = due_at - interval '4 days'
      WHERE id = ${invoice.id}::uuid`;
    await client.$executeRaw`ALTER TABLE invoices ENABLE TRIGGER invoices_guard`;
    actions = await invoices.runDunning([invoice.id]);
    expect(
      actions.map((action) => [action.kind, action.suspendedPlan]),
    ).toEqual([['suspended', pro.slug]]);
    expect(await invoices.runDunning([invoice.id])).toEqual([]);
    const suspended = await client.$transaction((tx) =>
      readPlan(tx, organization.id, new Date()),
    );
    expect(suspended.slug).toBe('free');
    const overview = await ledger.billing(organization.id);
    expect(overview.suspended).toEqual({
      invoiceNumber: invoice.number,
      plan: pro.slug,
    });
    expect(overview.outstanding[0]).toMatchObject({ overdue: true });

    const paid = await invoices.recordPayment({
      invoiceNumber: invoice.number,
      method: 'bank_transfer',
      note: 'KBZ transfer 123',
      actorEmail: operator,
    });
    expect(paid.restored).toBe(pro.slug);
    const restored = await client.$transaction((tx) =>
      readPlan(tx, organization.id, new Date()),
    );
    expect(restored.slug).toBe(pro.slug);
    const audit = await client.auditEvent.findMany({
      where: { organizationId: organization.id },
      select: { action: true },
    });
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'billing.invoice_issued',
        'billing.suspended_for_nonpayment',
        'billing.invoice_paid',
        'billing.plan_restored',
      ]),
    );
  });
});
