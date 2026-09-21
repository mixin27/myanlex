import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { quotaPeriod } from '../../common/quota/quota-period.js';
import type {
  QuotaDecision,
  QuotaRepository,
  QuotaSnapshot,
} from '../../common/quota/quota.repository.js';

async function readPlan(
  tx: Prisma.TransactionClient,
  organizationId: string,
  now: Date,
) {
  const subscriptions = await tx.$queryRaw<
    {
      name: string;
      slug: string;
      monthlyRequestLimit: bigint | null;
      monthlyCharacterLimit: bigint | null;
    }[]
  >`
    SELECT p.name, p.slug, p.monthly_request_limit AS "monthlyRequestLimit",
           p.monthly_character_limit AS "monthlyCharacterLimit"
    FROM subscriptions s JOIN plans p ON p.id = s.plan_id
    WHERE s.organization_id = ${organizationId}::uuid AND s.status = 'active'
      AND s.starts_at <= ${now.toISOString()}::timestamptz
      AND (s.ends_at IS NULL OR s.ends_at > ${now.toISOString()}::timestamptz)
    LIMIT 2`;
  if (subscriptions.length > 1)
    throw new Error('Ambiguous active subscription');
  const plan =
    subscriptions[0] ??
    (await tx.plan.findUniqueOrThrow({ where: { slug: 'free' } }));
  if (
    (plan.monthlyRequestLimit !== null && plan.monthlyRequestLimit < 0n) ||
    (plan.monthlyCharacterLimit !== null && plan.monthlyCharacterLimit < 0n)
  )
    throw new Error('Invalid plan limits');
  return {
    name: plan.name,
    slug: plan.slug,
    source: subscriptions.length
      ? ('subscription' as const)
      : ('free' as const),
    monthlyRequestLimit: plan.monthlyRequestLimit,
    monthlyCharacterLimit: plan.monthlyCharacterLimit,
  };
}

async function databaseTime(tx: Prisma.TransactionClient): Promise<Date> {
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

  async consume(projectId: string, characters: number): Promise<QuotaDecision> {
    if (!Number.isSafeInteger(characters) || characters < 0)
      throw new Error('Invalid character count');
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
        const plan = await readPlan(tx, organizationId, now);
        const requestLimit = plan.monthlyRequestLimit;
        const characterLimit = plan.monthlyCharacterLimit;

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
        return {
          allowed: changed === 1,
          retryAfterSeconds,
        };
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
