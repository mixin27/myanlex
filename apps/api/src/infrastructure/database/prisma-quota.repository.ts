import { randomUUID } from 'node:crypto';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  enforcedLimits,
  type PlanTerms,
} from '../../common/billing/pricing.js';
import { quotaPeriod } from '../../common/quota/quota-period.js';
import type {
  MeterInput,
  QuotaDecision,
  QuotaRepository,
  QuotaSnapshot,
} from '../../common/quota/quota.repository.js';

const planColumns = Prisma.sql`
  p.name, p.slug, p.monthly_request_limit AS "monthlyRequestLimit",
  p.monthly_character_limit AS "monthlyCharacterLimit", p.currency,
  p.base_fee_minor AS "baseFeeMinor", p.overage_mode AS "overageMode",
  p.request_block AS "requestBlock",
  p.request_block_price_minor AS "requestBlockPriceMinor",
  p.character_block AS "characterBlock",
  p.character_block_price_minor AS "characterBlockPriceMinor",
  p.request_ceiling AS "requestCeiling", p.character_ceiling AS "characterCeiling"`;

/** Plan terms in effect for an organization at `now` (Free without a subscription). */
export async function readPlan(
  tx: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
): Promise<PlanTerms & { source: 'subscription' | 'free' }> {
  const subscriptions = await tx.$queryRaw<PlanTerms[]>`
    SELECT ${planColumns}
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.organization_id = ${organizationId}::uuid AND s.status = 'active'
      AND s.starts_at <= ${now.toISOString()}::timestamptz
      AND (s.ends_at IS NULL OR s.ends_at > ${now.toISOString()}::timestamptz)
    LIMIT 2`;
  // The subscriptions_no_overlap constraint prevents this; kept as a guard.
  if (subscriptions.length > 1)
    throw new Error('Ambiguous active subscription');
  const plan =
    subscriptions[0] ??
    (
      await tx.$queryRaw<PlanTerms[]>`
        SELECT ${planColumns} FROM plans p WHERE p.slug = 'free'`
    )[0];
  if (!plan) throw new Error('Free plan missing');
  if (
    (plan.monthlyRequestLimit !== null && plan.monthlyRequestLimit < 0n) ||
    (plan.monthlyCharacterLimit !== null && plan.monthlyCharacterLimit < 0n)
  )
    throw new Error('Invalid plan limits');
  return {
    ...plan,
    currency: plan.currency.trim(),
    overageMode: plan.overageMode === 'allow' ? 'allow' : 'block',
    source: subscriptions.length ? 'subscription' : 'free',
  };
}

export async function databaseTime(
  tx: Prisma.TransactionClient,
): Promise<Date> {
  const [clock] = await tx.$queryRaw<
    { now: string }[]
  >`SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS now`;
  if (!clock) throw new Error('Database clock unavailable');
  return new Date(clock.now);
}

export class PrismaQuotaRepository
  implements QuotaRepository, OnApplicationShutdown
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

  async meter(input: MeterInput): Promise<QuotaDecision> {
    const { projectId, characters, enforce } = input;
    if (!Number.isSafeInteger(characters) || characters < 0)
      throw new Error('Invalid character count');
    if ((input.source === 'api_key') !== (input.apiKeyId !== null))
      throw new Error('Invalid usage source');
    return this.client.$transaction(
      async (tx) => {
        // Database time avoids disagreement between API replicas at UTC month boundaries.
        const now = await databaseTime(tx);
        const { monthStart, retryAfterSeconds } = quotaPeriod(now);
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { organizationId: true },
        });
        const organizationId = project.organizationId;
        // Unenforced requests are still metered; only the limit check is skipped.
        const plan = enforce ? await readPlan(tx, organizationId, now) : null;
        // Block plans stop at the allowance; overage plans at their ceiling.
        const limits = plan ? enforcedLimits(plan) : null;
        const requestLimit = limits?.requests ?? null;
        const characterLimit = limits?.characters ?? null;

        // INSERT and guarded UPDATE serialize on the same organization/month row.
        // Both dimensions are reserved together; a denied request spends neither.
        await tx.$executeRaw`
        INSERT INTO organization_quotas (organization_id, month_start, request_count, character_count)
        VALUES (${organizationId}::uuid, ${monthStart.toISOString()}::timestamptz, 0, 0)
        ON CONFLICT (organization_id, month_start) DO NOTHING`;
        const changed = await tx.$executeRaw`
        UPDATE organization_quotas
        SET request_count = request_count + 1,
            character_count = character_count + ${BigInt(characters)}, updated_at = CURRENT_TIMESTAMP
        WHERE organization_id = ${organizationId}::uuid
          AND month_start = ${monthStart.toISOString()}::timestamptz
          AND (${requestLimit}::bigint IS NULL OR request_count < ${requestLimit}::bigint)
          AND (${characterLimit}::bigint IS NULL OR character_count + ${BigInt(characters)} <= ${characterLimit}::bigint)`;
        if (changed !== 1)
          return { allowed: false, retryAfterSeconds, eventId: null };
        // Same transaction as the counter: the ledger and counter never diverge.
        const eventId = randomUUID();
        await tx.usageEvent.create({
          data: {
            id: eventId,
            organizationId,
            projectId,
            apiKeyId: input.apiKeyId,
            source: input.source,
            monthStart,
            requestUnits: 1,
            characters: BigInt(characters),
            endpoint: input.endpoint.slice(0, 160),
            requestId: input.requestId?.slice(0, 128) ?? null,
            createdAt: now,
          },
        });
        return { allowed: true, retryAfterSeconds, eventId };
      },
      { maxWait: 2_000, timeout: 5_000 },
    );
  }

  async read(organizationId: string): Promise<QuotaSnapshot> {
    return this.client.$transaction(
      async (tx) => {
        const now = await databaseTime(tx);
        const { monthStart, resetsAt } = quotaPeriod(now);
        const plan = await readPlan(tx, organizationId, now);
        const [counter] = await tx.$queryRaw<
          { requestCount: bigint; characterCount: bigint }[]
        >`
          SELECT request_count AS "requestCount", character_count AS "characterCount"
          FROM organization_quotas
          WHERE organization_id = ${organizationId}::uuid
            AND month_start = ${monthStart.toISOString()}::timestamptz`;
        return {
          now,
          monthStart,
          resetsAt,
          plan,
          requestCount: counter?.requestCount ?? 0n,
          characterCount: counter?.characterCount ?? 0n,
        };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 5_000 },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
