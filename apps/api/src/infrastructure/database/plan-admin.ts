import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../../generated/prisma/client.js';
import { databaseTime } from './prisma-quota.repository.js';

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
  })
  .strict()
  .superRefine((plan, context) => {
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
      const now = await databaseTime(tx);
      const startsAt = input.startsAt ?? now;
      if (startsAt < now)
        throw new PlanAdminError('A plan change cannot start in the past.');
      const plan = await tx.plan.findUnique({
        where: { slug: input.planSlug },
      });
      if (!plan) throw new PlanAdminError(`No plan ${input.planSlug}.`);
      if (plan.archivedAt)
        throw new PlanAdminError(`Plan ${plan.slug} is archived.`);

      const active = { organizationId: organization.id, status: 'active' };
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
                organizationId: organization.id,
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
          organizationId: organization.id,
          actorUserId: null,
          actorEmail,
          action: 'billing.plan_changed',
          targetType: 'organization',
          targetId: organization.id,
          metadata: {
            from,
            to: plan.slug,
            startsAt: startsAt.toISOString(),
            cancelledScheduled: cancelled.count,
            ...(note ? { note } : {}),
          },
        },
      });
      return {
        organizationId: organization.id,
        from,
        to: plan.slug,
        startsAt,
        subscription,
      };
    });
  }
}
