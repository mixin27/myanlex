import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import {
  PAYMENT_TERMS_DAYS,
  REMINDER_DAYS,
  monthStartOf,
  monthlyDrafts,
  nextMonthStartOf,
  prorationLine,
  sumLines,
  type InvoiceLineDraft,
} from '../../common/billing/invoicing.js';
import type { PlanTerms, StoredCharges } from '../../common/billing/pricing.js';
import { databaseTime, readPlan } from './prisma-quota.repository.js';
import { PlanAdminError, assignInTransaction } from './plan-admin.js';

/**
 * Invoices and payments (ADR 0026). Used by the operator scripts and by
 * applyPlanChange; payment providers will call recordPayment from their
 * verified callbacks.
 */
export const SYSTEM_ACTOR = 'billing-system@myanlex.invalid';
const DAY_MS = 86_400_000;

export type InvoiceWithLines = Prisma.InvoiceGetPayload<{
  include: {
    lines: true;
    payments: true;
    organization: { select: { slug: true; name: true } };
  };
}>;

const withDetails = {
  lines: { orderBy: { position: 'asc' } },
  payments: { orderBy: { receivedAt: 'asc' } },
  organization: { select: { slug: true, name: true } },
} as const;

/**
 * An invoice with its lines, payments and organization, loaded one query at a
 * time: inside an interactive transaction (one connection), a multi-relation
 * include would run queries concurrently on that connection.
 */
async function loadInvoice(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<InvoiceWithLines> {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
  const lines = await tx.invoiceLine.findMany({
    where: { invoiceId: id },
    orderBy: { position: 'asc' },
  });
  const payments = await tx.payment.findMany({
    where: { invoiceId: id },
    orderBy: { receivedAt: 'asc' },
  });
  const organization = await tx.organization.findUniqueOrThrow({
    where: { id: invoice.organizationId },
    select: { slug: true, name: true },
  });
  return { ...invoice, lines, payments, organization };
}

/** The next gap-free number for `year`, taken under the sequence row lock. */
async function nextNumber(tx: Prisma.TransactionClient, year: number) {
  const [row] = await tx.$queryRaw<{ last_number: number }[]>`
    INSERT INTO invoice_sequences (year, last_number) VALUES (${year}, 1)
    ON CONFLICT (year) DO UPDATE SET last_number = invoice_sequences.last_number + 1
    RETURNING last_number`;
  return `MLX-${year}-${String(row!.last_number).padStart(6, '0')}`;
}

/** Issues an invoice inside the caller's transaction, with its audit event. */
export async function createInvoice(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    kind: 'monthly' | 'proration';
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    lines: readonly InvoiceLineDraft[];
    planChangeId?: string | null;
    actorEmail: string;
  },
) {
  const now = await databaseTime(tx);
  const total = sumLines(input.lines);
  const invoice = await tx.invoice.create({
    data: {
      number: await nextNumber(tx, now.getUTCFullYear()),
      organizationId: input.organizationId,
      kind: input.kind,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.currency,
      subtotalMinor: total,
      totalMinor: total,
      issuedAt: now,
      dueAt: new Date(now.getTime() + PAYMENT_TERMS_DAYS * DAY_MS),
      planChangeId: input.planChangeId ?? null,
      lines: {
        create: input.lines.map((line, index) => ({
          position: index + 1,
          ...line,
        })),
      },
    },
  });
  await tx.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      actorUserId: null,
      actorEmail: input.actorEmail,
      action: 'billing.invoice_issued',
      targetType: 'organization',
      targetId: input.organizationId,
      metadata: {
        number: invoice.number,
        kind: invoice.kind,
        currency: invoice.currency,
        totalMinor: invoice.totalMinor.toString(),
      },
    },
  });
  return loadInvoice(tx, invoice.id);
}

/**
 * The prorated invoice for a plan change applied mid-month, or null when
 * nothing is owed (a downgrade, Free, a change starting on the 1st, or a
 * plan no dearer than the current one).
 */
export async function issueProration(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    from: PlanTerms | null;
    to: PlanTerms;
    startsAt: Date;
    planChangeId: string | null;
    actorEmail: string;
  },
) {
  if (input.startsAt.getTime() === monthStartOf(input.startsAt).getTime())
    return null; // The monthly invoice covers a change on the 1st.
  const line = prorationLine(input.from, input.to, input.startsAt);
  if (!line) return null;
  return createInvoice(tx, {
    organizationId: input.organizationId,
    kind: 'proration',
    periodStart: input.startsAt,
    periodEnd: nextMonthStartOf(input.startsAt),
    currency: input.to.currency,
    lines: [line],
    planChangeId: input.planChangeId,
    actorEmail: input.actorEmail,
  });
}

/** Members who can manage billing receive invoice email. */
export async function billingContacts(
  tx: Prisma.TransactionClient | PrismaClient,
  organizationId: string,
) {
  const rows = await tx.$queryRaw<{ email: string }[]>`
    SELECT DISTINCT u.email FROM organization_members m
    JOIN users u ON u.id = m.user_id
    JOIN role_permissions rp ON rp.role_id = m.role_id
    JOIN permissions p ON p.id = rp.permission_id AND p.key = 'billing.manage'
    WHERE m.organization_id = ${organizationId}::uuid
    ORDER BY u.email`;
  return rows.map((row) => row.email);
}

export interface MonthlyRun {
  readonly issued: InvoiceWithLines[];
  /** Workspaces whose previous month has usage but no closed statement yet. */
  readonly waitingForStatement: string[];
}

export interface DunningAction {
  readonly invoice: InvoiceWithLines;
  readonly kind: 'reminder' | 'suspended';
  readonly reminder?: number;
  readonly suspendedPlan?: string;
}

export class InvoiceAdmin {
  private readonly client: PrismaClient;

  constructor(databaseUrl: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  close() {
    return this.client.$disconnect();
  }

  contacts(organizationId: string) {
    return billingContacts(this.client, organizationId);
  }

  /**
   * Issues the invoices for `monthStart` (default: the current month): the
   * base fee on the plan in effect on the 1st, plus the overage of the
   * closed previous month. Idempotent per workspace, month and currency.
   */
  async issueMonthly(monthStart?: Date): Promise<MonthlyRun> {
    const now = await this.client.$transaction((tx) => databaseTime(tx));
    const month = monthStartOf(monthStart ?? now);
    if (month > now) throw new PlanAdminError('That month has not started.');
    const previous = monthStartOf(new Date(month.getTime() - DAY_MS));
    const candidates = await this.client.$queryRaw<{ id: string }[]>`
      SELECT s.organization_id AS id FROM subscriptions s
      WHERE s.status = 'active' AND s.starts_at <= ${month.toISOString()}::timestamptz
        AND (s.ends_at IS NULL OR s.ends_at > ${month.toISOString()}::timestamptz)
      UNION
      SELECT q.organization_id FROM organization_quotas q
      WHERE q.month_start = ${previous.toISOString()}::timestamptz`;
    const issued: InvoiceWithLines[] = [];
    const waitingForStatement: string[] = [];
    for (const { id: organizationId } of candidates) {
      const result = await this.client
        .$transaction(async (tx) => {
          const plan = await readPlan(tx, organizationId, month);
          const statement = await tx.usageStatement.findUnique({
            where: {
              organizationId_monthStart: {
                organizationId,
                monthStart: previous,
              },
            },
          });
          const usedLastMonth = await tx.organizationQuota.findUnique({
            where: {
              organizationId_monthStart: {
                organizationId,
                monthStart: previous,
              },
            },
          });
          if (usedLastMonth && !statement) return 'waiting' as const;
          const drafts = monthlyDrafts(
            month,
            plan,
            statement
              ? {
                  monthStart: previous,
                  planSlug: (statement.plan as { slug: string }).slug,
                  charges: statement.charges as unknown as StoredCharges | null,
                }
              : null,
          );
          const created: InvoiceWithLines[] = [];
          for (const draft of drafts) {
            const exists = await tx.invoice.findFirst({
              where: {
                organizationId,
                kind: 'monthly',
                periodStart: month,
                currency: draft.currency,
              },
            });
            if (exists) continue;
            created.push(
              await createInvoice(tx, {
                organizationId,
                kind: 'monthly',
                periodStart: month,
                periodEnd: nextMonthStartOf(month),
                currency: draft.currency,
                lines: draft.lines,
                actorEmail: SYSTEM_ACTOR,
              }),
            );
          }
          return created;
        })
        // A concurrent run issued this workspace's invoice first.
        .catch((error: unknown) => {
          if ((error as { code?: string }).code === 'P2002') return [];
          throw error;
        });
      if (result === 'waiting') {
        const organization = await this.client.organization.findUnique({
          where: { id: organizationId },
          select: { slug: true },
        });
        waitingForStatement.push(organization?.slug ?? organizationId);
      } else issued.push(...result);
    }
    return { issued, waitingForStatement };
  }

  list(filter: {
    status?: 'open' | 'overdue' | 'paid' | 'void';
    workspace?: string;
  }) {
    const now = new Date();
    return this.client.invoice.findMany({
      where: {
        ...(filter.status === 'overdue'
          ? { status: 'open', dueAt: { lt: now } }
          : filter.status
            ? { status: filter.status }
            : {}),
        ...(filter.workspace
          ? { organization: { slug: filter.workspace } }
          : {}),
      },
      orderBy: [{ issuedAt: 'desc' }, { number: 'desc' }],
      take: 200,
      include: withDetails,
    });
  }

  async show(number: string) {
    const invoice = await this.client.invoice.findUnique({
      where: { number },
      include: withDetails,
    });
    if (!invoice) throw new PlanAdminError(`No invoice ${number}.`);
    return invoice;
  }

  /**
   * Records a full payment of an open invoice and, if dunning moved the
   * workspace to Free for it, restores the invoiced plan. The single entry
   * point for bank transfers now and provider callbacks later.
   */
  async recordPayment(input: {
    invoiceNumber: string;
    method: 'bank_transfer' | 'cash' | 'provider';
    provider?: string | undefined;
    externalRef?: string | undefined;
    amountMinor?: bigint | undefined;
    currency?: string | undefined;
    note?: string | undefined;
    actorEmail: string;
  }) {
    const actorEmail = z.email().max(320).parse(input.actorEmail);
    return this.client.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM invoices WHERE number = ${input.invoiceNumber} FOR UPDATE`;
      if (!locked)
        throw new PlanAdminError(`No invoice ${input.invoiceNumber}.`);
      const invoice = await tx.invoice.findUniqueOrThrow({
        where: { id: locked.id },
      });
      if (invoice.status !== 'open')
        throw new PlanAdminError(
          `Invoice ${invoice.number} is already ${invoice.status}.`,
        );
      const amount = input.amountMinor ?? invoice.totalMinor;
      if (amount !== invoice.totalMinor)
        throw new PlanAdminError(
          `The payment must be the full ${invoice.totalMinor} (${invoice.currency} minor units); partial payments aren't supported.`,
        );
      if (input.currency && input.currency !== invoice.currency)
        throw new PlanAdminError(
          `Invoice ${invoice.number} is in ${invoice.currency}, not ${input.currency}.`,
        );
      const now = await databaseTime(tx);
      await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          method: input.method,
          provider: input.provider ?? null,
          externalRef: input.externalRef ?? null,
          amountMinor: amount,
          currency: invoice.currency,
          receivedAt: now,
          recordedBy: actorEmail,
          note: input.note?.trim().slice(0, 500) || null,
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'paid', paidAt: now },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: invoice.organizationId,
          actorUserId: null,
          actorEmail,
          action: 'billing.invoice_paid',
          targetType: 'organization',
          targetId: invoice.organizationId,
          metadata: {
            number: invoice.number,
            method: input.method,
            ...(input.provider ? { provider: input.provider } : {}),
            totalMinor: invoice.totalMinor.toString(),
            currency: invoice.currency,
          },
        },
      });
      let restored: string | null = null;
      if (invoice.restoresPlanSlug) {
        const [organization] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM organizations WHERE id = ${invoice.organizationId}::uuid FOR UPDATE`;
        const current = await readPlan(tx, organization!.id, now);
        const plan = await tx.plan.findUnique({
          where: { slug: invoice.restoresPlanSlug },
        });
        // Restore only while still on Free and the plan can be assigned.
        if (current.slug === 'free' && plan && !plan.archivedAt) {
          await assignInTransaction(tx, {
            organizationId: invoice.organizationId,
            planSlug: plan.slug,
            actorEmail,
            note: `Restored after payment of ${invoice.number}`,
          });
          await tx.auditEvent.create({
            data: {
              organizationId: invoice.organizationId,
              actorUserId: null,
              actorEmail,
              action: 'billing.plan_restored',
              targetType: 'organization',
              targetId: invoice.organizationId,
              metadata: { number: invoice.number, plan: plan.slug },
            },
          });
          restored = plan.slug;
        }
      }
      return {
        invoice: await loadInvoice(tx, invoice.id),
        restored,
      };
    });
  }

  async void(input: {
    invoiceNumber: string;
    reason: string;
    actorEmail: string;
  }) {
    const actorEmail = z.email().max(320).parse(input.actorEmail);
    const reason = input.reason.trim().slice(0, 500);
    if (!reason) throw new PlanAdminError('Give a reason for voiding.');
    return this.client.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { number: input.invoiceNumber },
      });
      if (!invoice)
        throw new PlanAdminError(`No invoice ${input.invoiceNumber}.`);
      if (invoice.status !== 'open')
        throw new PlanAdminError(
          `Invoice ${invoice.number} is already ${invoice.status}.`,
        );
      const now = await databaseTime(tx);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'void', voidedAt: now, voidReason: reason },
      });
      const updated = await loadInvoice(tx, invoice.id);
      await tx.auditEvent.create({
        data: {
          organizationId: invoice.organizationId,
          actorUserId: null,
          actorEmail,
          action: 'billing.invoice_voided',
          targetType: 'organization',
          targetId: invoice.organizationId,
          metadata: { number: invoice.number, reason },
        },
      });
      return updated;
    });
  }

  /**
   * Sends due reminders (days 0, 3 and 6 after issue) and moves workspaces
   * with an overdue invoice to Free, remembering the plan to restore on
   * payment. Idempotent: each reminder and each suspension happens once.
   */
  async runDunning(only?: readonly string[]): Promise<DunningAction[]> {
    const actions: DunningAction[] = [];
    const open = await this.client.invoice.findMany({
      where: { status: 'open', ...(only ? { id: { in: [...only] } } : {}) },
      orderBy: { issuedAt: 'asc' },
      select: { id: true },
    });
    for (const { id } of open) {
      const action = await this.client.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM invoices WHERE id = ${id}::uuid AND status = 'open' FOR UPDATE`;
        if (!locked) return [];
        const invoice = await tx.invoice.findUniqueOrThrow({ where: { id } });
        const now = await databaseTime(tx);
        const done: DunningAction[] = [];
        // Overdue: suspend once; no more reminders.
        if (now >= invoice.dueAt) {
          if (invoice.restoresPlanSlug) return done;
          await tx.$queryRaw`
            SELECT id FROM organizations WHERE id = ${invoice.organizationId}::uuid FOR UPDATE`;
          const current = await readPlan(tx, invoice.organizationId, now);
          if (current.slug !== 'free') {
            await assignInTransaction(tx, {
              organizationId: invoice.organizationId,
              planSlug: 'free',
              actorEmail: SYSTEM_ACTOR,
              note: `Invoice ${invoice.number} unpaid`,
            });
            await tx.invoice.update({
              where: { id },
              data: { restoresPlanSlug: current.slug },
            });
            const updated = await loadInvoice(tx, id);
            await tx.auditEvent.create({
              data: {
                organizationId: invoice.organizationId,
                actorUserId: null,
                actorEmail: SYSTEM_ACTOR,
                action: 'billing.suspended_for_nonpayment',
                targetType: 'organization',
                targetId: invoice.organizationId,
                metadata: { number: invoice.number, plan: current.slug },
              },
            });
            done.push({
              invoice: updated,
              kind: 'suspended',
              suspendedPlan: current.slug,
            });
          }
          return done;
        }
        const age = Math.floor(
          (now.getTime() - invoice.issuedAt.getTime()) / DAY_MS,
        );
        const due = REMINDER_DAYS.filter((day) => day <= age).length;
        if (due > invoice.remindersSent) {
          await tx.invoice.update({
            where: { id },
            data: { remindersSent: due },
          });
          const updated = await loadInvoice(tx, id);
          done.push({ invoice: updated, kind: 'reminder', reminder: due });
        }
        return done;
      });
      actions.push(...action);
    }
    return actions;
  }
}
