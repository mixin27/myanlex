import { createHash, randomBytes } from 'node:crypto';

import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  Prisma,
  PrismaClient,
  type BillingEmail,
} from '../../generated/prisma/client.js';
import type { AuditActor } from '../../modules/platform/audit.js';
import {
  BILLING_EMAIL_RESEND_MS,
  BILLING_EMAIL_TOKEN_MS,
  BillingProfileError,
  MAX_BILLING_EMAILS,
  type BillingDetails,
  type BillingEmailRecord,
  type BillingProfileRecord,
  type BillingProfileRepository,
  type PendingBillingEmail,
} from '../../modules/platform/billing-profile.js';
import { recordAudit } from './audit-writer.js';
import { databaseTime } from './prisma-quota.repository.js';

export const hashBillingEmailToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const detailFields = ['legalName', 'address', 'taxId', 'invoiceNote'] as const;

function toEmailRecord(row: BillingEmail, now: Date): BillingEmailRecord {
  return {
    id: row.id,
    email: row.email,
    status: row.verifiedAt
      ? 'confirmed'
      : row.tokenExpiresAt && row.tokenExpiresAt > now
        ? 'pending'
        : 'expired',
    sentAt: row.tokenExpiresAt
      ? new Date(row.tokenExpiresAt.getTime() - BILLING_EMAIL_TOKEN_MS)
      : row.createdAt,
    verifiedAt: row.verifiedAt,
  };
}

async function readProfile(
  tx: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
): Promise<BillingProfileRecord> {
  const profile = await tx.billingProfile.findUnique({
    where: { organizationId },
  });
  const emails = await tx.billingEmail.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return {
    details: {
      legalName: profile?.legalName ?? null,
      address: profile?.address ?? null,
      taxId: profile?.taxId ?? null,
      invoiceNote: profile?.invoiceNote ?? null,
    },
    emails: emails.map((row) => toEmailRecord(row, now)),
  };
}

/** Locks the organization row so concurrent adds respect the limit. */
async function lockOrganization(
  tx: Prisma.TransactionClient,
  organizationId: string,
) {
  const [row] = await tx.$queryRaw<{ name: string }[]>`
    SELECT name FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
  if (!row) throw new BillingProfileError('not_found', 'Workspace not found.');
  return row.name;
}

function newToken(now: Date) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashBillingEmailToken(token),
    tokenExpiresAt: new Date(now.getTime() + BILLING_EMAIL_TOKEN_MS),
  };
}

export class PrismaBillingProfileRepository
  implements BillingProfileRepository, OnApplicationShutdown
{
  private readonly client: PrismaClient;

  constructor(databaseUrl: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  async onApplicationShutdown() {
    await this.client.$disconnect();
  }

  profile(organizationId: string) {
    return this.client.$transaction(async (tx) =>
      readProfile(tx, organizationId, await databaseTime(tx)),
    );
  }

  updateDetails(
    organizationId: string,
    actor: AuditActor,
    details: BillingDetails,
  ) {
    return this.client.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const now = await databaseTime(tx);
      const before = await readProfile(tx, organizationId, now);
      const changed = detailFields.filter(
        (field) => before.details[field] !== details[field],
      );
      if (changed.length === 0) return before;
      await tx.billingProfile.upsert({
        where: { organizationId },
        create: { organizationId, ...details, updatedByUserId: actor.userId },
        update: { ...details, updatedByUserId: actor.userId },
      });
      await recordAudit(tx, organizationId, actor, {
        action: 'billing.profile_updated',
        targetType: 'organization',
        targetId: organizationId,
        metadata: { fields: [...changed] },
      });
      return readProfile(tx, organizationId, now);
    });
  }

  async addEmail(
    organizationId: string,
    actor: AuditActor,
    email: string,
  ): Promise<PendingBillingEmail> {
    const address = email.trim().toLowerCase();
    try {
      return await this.client.$transaction(async (tx) => {
        const organizationName = await lockOrganization(tx, organizationId);
        const existing = await tx.billingEmail.findMany({
          where: { organizationId },
          select: { email: true },
        });
        if (existing.some((row) => row.email === address))
          throw new BillingProfileError(
            'duplicate_email',
            'That address is already a billing email.',
          );
        if (existing.length >= MAX_BILLING_EMAILS)
          throw new BillingProfileError(
            'email_limit',
            `A workspace can have at most ${MAX_BILLING_EMAILS} billing emails.`,
          );
        const now = await databaseTime(tx);
        const { token, ...tokenFields } = newToken(now);
        const row = await tx.billingEmail.create({
          data: {
            organizationId,
            email: address,
            ...tokenFields,
            createdAt: now,
            createdByUserId: actor.userId,
          },
        });
        await recordAudit(tx, organizationId, actor, {
          action: 'billing.email_added',
          targetType: 'organization',
          targetId: organizationId,
          metadata: { email: address },
        });
        return { email: toEmailRecord(row, now), token, organizationName };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new BillingProfileError(
          'duplicate_email',
          'That address is already a billing email.',
        );
      throw error;
    }
  }

  resendEmail(organizationId: string, emailId: string) {
    return this.client.$transaction(async (tx) => {
      const organizationName = await lockOrganization(tx, organizationId);
      const row = await tx.billingEmail.findFirst({
        where: { id: emailId, organizationId },
      });
      if (!row)
        throw new BillingProfileError('not_found', 'Billing email not found.');
      if (row.verifiedAt)
        throw new BillingProfileError(
          'already_confirmed',
          'That address is already confirmed.',
        );
      const now = await databaseTime(tx);
      const sentAt = toEmailRecord(row, now).sentAt;
      if (now.getTime() - sentAt.getTime() < BILLING_EMAIL_RESEND_MS)
        throw new BillingProfileError(
          'too_soon',
          'A confirmation email was just sent. Try again in a minute.',
        );
      const { token, ...tokenFields } = newToken(now);
      const updated = await tx.billingEmail.update({
        where: { id: row.id },
        data: tokenFields,
      });
      return { email: toEmailRecord(updated, now), token, organizationName };
    });
  }

  removeEmail(organizationId: string, actor: AuditActor, emailId: string) {
    return this.client.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const row = await tx.billingEmail.findFirst({
        where: { id: emailId, organizationId },
      });
      if (!row)
        throw new BillingProfileError('not_found', 'Billing email not found.');
      await tx.billingEmail.delete({ where: { id: row.id } });
      await recordAudit(tx, organizationId, actor, {
        action: 'billing.email_removed',
        targetType: 'organization',
        targetId: organizationId,
        metadata: { email: row.email, confirmed: row.verifiedAt !== null },
      });
    });
  }

  confirmEmail(token: string) {
    const tokenHash = hashBillingEmailToken(token);
    return this.client.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<
        {
          id: string;
          organization_id: string;
          email: string;
          token_expires_at: Date | null;
          name: string;
        }[]
      >`
        SELECT b.id, b.organization_id, b.email, b.token_expires_at, o.name
        FROM billing_emails b JOIN organizations o ON o.id = b.organization_id
        WHERE b.token_hash = ${tokenHash}
        FOR UPDATE OF b`;
      const now = await databaseTime(tx);
      if (!row || !row.token_expires_at || row.token_expires_at <= now)
        throw new BillingProfileError(
          'invalid_or_expired',
          'This confirmation link has already been used or has expired. Ask for a new one from the Billing page.',
        );
      await tx.billingEmail.update({
        where: { id: row.id },
        data: { verifiedAt: now, tokenHash: null, tokenExpiresAt: null },
      });
      // Confirmed by whoever holds the mailbox, who may not be a member.
      await tx.auditEvent.create({
        data: {
          organizationId: row.organization_id,
          actorUserId: null,
          actorEmail: row.email,
          action: 'billing.email_confirmed',
          targetType: 'organization',
          targetId: row.organization_id,
          metadata: { email: row.email },
        },
      });
      return { organizationName: row.name, email: row.email };
    });
  }
}
