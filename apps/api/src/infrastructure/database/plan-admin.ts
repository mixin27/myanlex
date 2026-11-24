import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { databaseTime, readPlan } from './prisma-quota.repository.js';
import { issueProration } from './billing-invoices.js';
import {
  changeKind,
  monthStartOf,
  nextMonthStartOf,
} from '../../common/billing/invoicing.js';
import type { PlanTerms } from '../../common/billing/pricing.js';

/**
 * Operator plan management behind `pnpm billing:plans` and `pnpm
 * billing:assign`. There is no HTTP route for these. See
 * docs/decisions/0024-plans-and-pricing.md.
 */
const count = z
  .union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)])
  .transform((value) => BigInt(value));
const positive = count.refine((value) => value > 0n, 'Must be positive.');

export const planDefinition = z
  .object({
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable().default(null),
    public: z.boolean().default(false),
    currency: z.string().regex(/^[A-Z]{3}$/, 'Use an ISO 4217 code.'),
    baseFeeMinor: count,
    monthlyRequestLimit: count.nullable(),
    monthlyCharacterLimit: count.nullable(),
    overageMode: z.enum(['block', 'allow']),
    requestBlock: positive.default(1000n),
    requestBlockPriceMinor: count.default(0n),
    characterBlock: positive.default(100_000n),
    characterBlockPriceMinor: count.default(0n),
    requestCeiling: count.nullable().default(null),
    characterCeiling: count.nullable().default(null),
    /** `self_service` (checkout) needs a payment provider; see ADR 0025. */
    changePolicy: z.enum(['approval', 'self_service']).default('approval'),
  })
  .strict()
  .superRefine((plan, context) => {
    if (plan.changePolicy === 'self_service')
      context.addIssue({
        code: 'custom',
        path: ['changePolicy'],
        message:
          'self_service needs a payment provider (checkout), which MyanLex does not have yet. Use approval.',
      });
    for (const [ceiling, limit] of [
      ['requestCeiling', 'monthlyRequestLimit'],
      ['characterCeiling', 'monthlyCharacterLimit'],
    ] as const) {
      const value = plan[ceiling];
      if (value === null) continue;
      if (plan.overageMode !== 'allow')
        context.addIssue({
          code: 'custom',
          path: [ceiling],
          message: 'Ceilings apply only to overage plans.',
        });
      const allowance = plan[limit];
      if (allowance === null || value < allowance)
        context.addIssue({
          code: 'custom',
          path: [ceiling],
          message: 'A ceiling cannot be below the allowance.',
        });
    }
  });
export type PlanDefinition = z.infer<typeof planDefinition>;

/** Columns fixed once a subscription has used the plan (also enforced by trigger). */
const terms = [
  'currency',
  'baseFeeMinor',
  'monthlyRequestLimit',
  'monthlyCharacterLimit',
  'overageMode',
  'requestBlock',
  'requestBlockPriceMinor',
  'characterBlock',
  'characterBlockPriceMinor',
  'requestCeiling',
  'characterCeiling',
] as const;

export class PlanAdminError extends Error {}

export class PlanAdmin {
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

  async list() {
    const plans = await this.client.plan.findMany({
      orderBy: [
        { archivedAt: { sort: 'desc', nulls: 'first' } },
        { slug: 'asc' },
      ],
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map(({ _count, ...plan }) => ({
      ...plan,
      currency: plan.currency.trim(),
      subscriptions: _count.subscriptions,
    }));
  }

  /** Creates a plan, or changes the descriptive fields of an existing one. */
  async upsert(input: unknown): Promise<'created' | 'updated'> {
    const plan = planDefinition.parse(input);
    return this.client.$transaction(async (tx) => {
      const existing = await tx.plan.findUnique({
        where: { slug: plan.slug },
        include: { _count: { select: { subscriptions: true } } },
      });
      if (!existing) {
        await tx.plan.create({ data: plan });
        return 'created' as const;
      }
      if (existing.archivedAt)
        throw new PlanAdminError(`Plan ${plan.slug} is archived.`);
      const changed = terms.filter((key) => {
        const before =
          key === 'currency' ? existing.currency.trim() : existing[key];
        return before !== plan[key];
      });
      if (existing._count.subscriptions > 0 && changed.length)
        throw new PlanAdminError(
          `Plan ${plan.slug} has subscriptions, so ${changed.join(', ')} cannot change. Create a new plan (for example ${plan.slug}-v2) and archive this one.`,
        );
      await tx.plan.update({ where: { id: existing.id }, data: plan });
      return 'updated' as const;
    });
  }

  /** Stops new assignments; current subscriptions keep the plan. */
  async archive(slug: string) {
    if (slug === 'free') throw new PlanAdminError('Free cannot be archived.');
    const result = await this.client.plan.updateMany({
      where: { slug, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count !== 1)
      throw new PlanAdminError(`No unarchived plan ${slug}.`);
  }

  /**
   * Moves an organization to `planSlug` from `startsAt` (default: now), ending
   * the subscription in effect then and cancelling later scheduled ones.
   * `free` ends the subscription without starting another. Starts cannot be in
   * the past, so closed months are never re-priced.
   */
  async assign(input: {
    organizationSlug: string;
    planSlug: string;
    actorEmail: string;
    note?: string | undefined;
    startsAt?: Date | undefined;
  }) {
    const actorEmail = z.email().max(320).parse(input.actorEmail);
    const note = input.note?.trim().slice(0, 500) || null;
    return this.client.$transaction(async (tx) => {
      const [organization] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM organizations WHERE slug = ${input.organizationSlug}
        FOR UPDATE`;
      if (!organization)
        throw new PlanAdminError(`No workspace ${input.organizationSlug}.`);
      return assignInTransaction(tx, {
        organizationId: organization.id,
        planSlug: input.planSlug,
        actorEmail,
        note,
        startsAt: input.startsAt,
      });
    });
  }

  /** Open and recent plan changes for `pnpm billing:changes list`. */
  listChanges(all = false) {
    return this.client.planChange.findMany({
      where: all ? {} : { status: { in: [...openChangeStatuses] } },
      orderBy: { createdAt: all ? 'desc' : 'asc' },
      take: all ? 100 : 500,
      include: {
        organization: { select: { slug: true, name: true } },
        plan: { select: { slug: true, name: true } },
      },
    });
  }

  /** Approves an open approval-channel change and applies it. */
  async approveChange(input: {
    changeId: string;
    actorEmail: string;
    note?: string | undefined;
  }) {
    const actorEmail = z.email().max(320).parse(input.actorEmail);
    return this.client.$transaction((tx) =>
      applyPlanChange(tx, input.changeId, {
        actorEmail,
        note: input.note?.trim().slice(0, 500) || null,
      }),
    );
  }

  /** Rejects an open approval-channel change with a reason for the requester. */
  async rejectChange(input: {
    changeId: string;
    actorEmail: string;
    reason: string;
  }) {
    const actorEmail = z.email().max(320).parse(input.actorEmail);
    const reason = input.reason.trim().slice(0, 500);
    if (!reason) throw new PlanAdminError('Give a reason for the rejection.');
    return this.client.$transaction(async (tx) => {
      const change = await lockOpenChange(tx, input.changeId);
      const now = await databaseTime(tx);
      const updated = await tx.planChange.update({
        where: { id: change.id },
        data: {
          status: 'rejected',
          decidedAt: now,
          decidedBy: actorEmail,
          decisionNote: reason,
        },
        include: {
          organization: { select: { slug: true, name: true } },
          plan: { select: { slug: true, name: true } },
        },
      });
      await tx.auditEvent.create({
        data: {
          organizationId: change.organizationId,
          actorUserId: null,
          actorEmail,
          action: 'billing.plan_change_rejected',
          targetType: 'organization',
          targetId: change.organizationId,
          metadata: {
            changeId: change.id,
            channel: change.channel,
            from: change.fromPlanSlug,
            to: updated.plan.slug,
            reason,
          },
        },
      });
      return updated;
    });
  }
}

export const openChangeStatuses = ['pending', 'awaiting_payment'] as const;

/** Locks a plan change for a decision; it must still be open. */
async function lockOpenChange(tx: Prisma.TransactionClient, changeId: string) {
  if (!z.uuid().safeParse(changeId).success)
    throw new PlanAdminError(`No plan change ${changeId}.`);
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM plan_changes WHERE id = ${changeId}::uuid FOR UPDATE`;
  if (!row) throw new PlanAdminError(`No plan change ${changeId}.`);
  const change = await tx.planChange.findUniqueOrThrow({
    where: { id: changeId },
  });
  if (!(openChangeStatuses as readonly string[]).includes(change.status))
    throw new PlanAdminError(
      `Plan change ${changeId} is already ${change.status}.`,
    );
  return change;
}

/** First instant of the UTC month after `date`. */
export function nextMonthStart(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

/**
 * The shared step that applies an open plan change, whatever its channel:
 * the approval script now, a checkout webhook later. `next_month` starts on
 * its requested date, or now if that has passed (never in the past).
 */
export async function applyPlanChange(
  tx: Prisma.TransactionClient,
  changeId: string,
  options: { actorEmail: string; note?: string | null },
) {
  const change = await lockOpenChange(tx, changeId);
  const [organization] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM organizations WHERE id = ${change.organizationId}::uuid
    FOR UPDATE`;
  if (!organization)
    throw new PlanAdminError('The workspace no longer exists.');
  const now = await databaseTime(tx);
  const requested = change.requestedStartsAt;
  const plan = await tx.plan.findUniqueOrThrow({
    where: { id: change.planId },
  });
  const current = await readPlan(tx, change.organizationId, now);
  const terms = planTerms(plan);
  const kind = changeKind(current, terms);
  let startsAt = requested && requested > now ? requested : now;
  // Downgrades, Free and currency changes start on the 1st: no refunds or
  // cross-currency proration (ADR 0026).
  if (
    kind !== 'upgrade' &&
    startsAt.getTime() !== monthStartOf(startsAt).getTime()
  )
    startsAt = nextMonthStartOf(now);
  const assigned = await assignInTransaction(tx, {
    organizationId: change.organizationId,
    planSlug: plan.slug,
    actorEmail: options.actorEmail,
    note: options.note ?? change.note,
    startsAt,
  });
  const updated = await tx.planChange.update({
    where: { id: change.id },
    data: {
      status: 'applied',
      decidedAt: now,
      decidedBy: options.actorEmail,
      decisionNote: options.note ?? null,
      subscriptionId: assigned.subscription?.id ?? null,
    },
    include: {
      organization: { select: { slug: true, name: true } },
      plan: { select: { slug: true, name: true } },
    },
  });
  await tx.auditEvent.create({
    data: {
      organizationId: change.organizationId,
      actorUserId: null,
      actorEmail: options.actorEmail,
      action: 'billing.plan_change_applied',
      targetType: 'organization',
      targetId: change.organizationId,
      metadata: {
        changeId: change.id,
        channel: change.channel,
        from: assigned.from,
        to: plan.slug,
        startsAt: startsAt.toISOString(),
        startedEarly: Boolean(
          requested && startsAt.getTime() !== requested.getTime(),
        ),
        ...(options.note ? { note: options.note } : {}),
      },
    },
  });
  // Upgrades applied mid-month are invoiced for the rest of the month.
  const invoice =
    kind === 'upgrade'
      ? await issueProration(tx, {
          organizationId: change.organizationId,
          from: current,
          to: terms,
          startsAt,
          planChangeId: change.id,
          actorEmail: options.actorEmail,
        })
      : null;
  return {
    change: updated,
    startsAt,
    requestedStartsAt: requested,
    /** True when the start differs from the requested date (it had passed). */
    startedEarly: Boolean(
      requested && startsAt.getTime() !== requested.getTime(),
    ),
    invoice,
  };
}

/**
 * Assigns `planSlug` to an organization inside the caller's transaction. The
 * caller holds the organization row lock. Used by `billing:assign` and by
 * applyPlanChange, so every channel changes plans the same way.
 */
export async function assignInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    planSlug: string;
    actorEmail: string;
    note: string | null;
    startsAt?: Date | undefined;
  },
) {
  const { organizationId, actorEmail, note } = input;
  const now = await databaseTime(tx);
  const startsAt = input.startsAt ?? now;
  if (startsAt < now)
    throw new PlanAdminError('A plan change cannot start in the past.');
  const plan = await tx.plan.findUnique({ where: { slug: input.planSlug } });
  if (!plan) throw new PlanAdminError(`No plan ${input.planSlug}.`);
  if (plan.archivedAt)
    throw new PlanAdminError(`Plan ${plan.slug} is archived.`);

  const active = { organizationId, status: 'active' };
  const previous = await tx.subscription.findFirst({
    where: {
      ...active,
      startsAt: { lte: startsAt },
      OR: [{ endsAt: null }, { endsAt: { gt: startsAt } }],
    },
    include: { plan: { select: { slug: true } } },
  });
  // Later scheduled changes are superseded by this one.
  const cancelled = await tx.subscription.updateMany({
    where: { ...active, startsAt: { gt: startsAt } },
    data: { status: 'canceled' },
  });
  // A subscription replaced at its own start never took effect.
  if (previous)
    await tx.subscription.update({
      where: { id: previous.id },
      data:
        previous.startsAt.getTime() === startsAt.getTime()
          ? { status: 'canceled' }
          : { endsAt: startsAt },
    });
  const subscription =
    plan.slug === 'free'
      ? null
      : await tx.subscription.create({
          data: {
            organizationId,
            planId: plan.id,
            status: 'active',
            startsAt,
            assignedBy: actorEmail,
            note,
          },
        });
  const from = previous?.plan.slug ?? 'free';
  await tx.auditEvent.create({
    data: {
      organizationId,
      actorUserId: null,
      actorEmail,
      action: 'billing.plan_changed',
      targetType: 'organization',
      targetId: organizationId,
      metadata: {
        from,
        to: plan.slug,
        startsAt: startsAt.toISOString(),
        cancelledScheduled: cancelled.count,
        ...(note ? { note } : {}),
      },
    },
  });
  return { organizationId, from, to: plan.slug, startsAt, subscription };
}

/** Plan terms from a plans row (as readPlan returns them). */
export function planTerms(row: {
  name: string;
  slug: string;
  monthlyRequestLimit: bigint | null;
  monthlyCharacterLimit: bigint | null;
  currency: string;
  baseFeeMinor: bigint;
  overageMode: string;
  requestBlock: bigint;
  requestBlockPriceMinor: bigint;
  characterBlock: bigint;
  characterBlockPriceMinor: bigint;
  requestCeiling: bigint | null;
  characterCeiling: bigint | null;
}): PlanTerms {
  return {
    name: row.name,
    slug: row.slug,
    monthlyRequestLimit: row.monthlyRequestLimit,
    monthlyCharacterLimit: row.monthlyCharacterLimit,
    currency: row.currency.trim(),
    baseFeeMinor: row.baseFeeMinor,
    overageMode: row.overageMode === 'allow' ? 'allow' : 'block',
    requestBlock: row.requestBlock,
    requestBlockPriceMinor: row.requestBlockPriceMinor,
    characterBlock: row.characterBlock,
    characterBlockPriceMinor: row.characterBlockPriceMinor,
    requestCeiling: row.requestCeiling,
    characterCeiling: row.characterCeiling,
  };
}
