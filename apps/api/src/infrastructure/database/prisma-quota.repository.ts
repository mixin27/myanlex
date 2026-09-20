import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { quotaPeriod } from '../../common/quota/quota-period.js';
import type {
  QuotaDecision,
  QuotaRepository,
} from '../../common/quota/quota.repository.js';

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
        const [clock] = await tx.$queryRaw<
          { now: Date }[]
        >`SELECT CURRENT_TIMESTAMP AS now`;
        if (!clock) throw new Error('Database clock unavailable');
        const now = clock.now;
        const { monthStart, retryAfterSeconds } = quotaPeriod(now);
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId },
          select: { organizationId: true },
        });
        const organizationId = project.organizationId;
        const subscriptions = await tx.subscription.findMany({
          where: {
            organizationId,
            status: 'active',
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: { plan: true },
          take: 2,
        });
        if (subscriptions.length > 1)
          throw new Error('Ambiguous active subscription');
        const plan =
          subscriptions[0]?.plan ??
          (await tx.plan.findUniqueOrThrow({ where: { slug: 'free' } }));
        const requestLimit = plan.monthlyRequestLimit;
        const characterLimit = plan.monthlyCharacterLimit;
        if (
          (requestLimit !== null && requestLimit < 0n) ||
          (characterLimit !== null && characterLimit < 0n)
        )
          throw new Error('Invalid plan limits');

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

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
