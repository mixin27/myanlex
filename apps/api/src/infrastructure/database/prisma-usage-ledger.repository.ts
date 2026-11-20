import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '../../generated/prisma/client.js';
import { quotaPeriod } from '../../common/quota/quota-period.js';
import { databaseTime, readPlan } from './prisma-quota.repository.js';
import {
  priceUsage,
  storeCharges,
  storeTerms,
  type StoredCharges,
} from '../../common/billing/pricing.js';
import type {
  BillingOverview,
  ClosedMonth,
  LedgerEvent,
  StatementLine,
  StatementPlan,
  UsageLedgerRepository,
  UsageSource,
  UsageStatementRecord,
} from '../../modules/platform/usage-ledger.js';

const cleanupBatch = 500;
const closeBatch = 500;
// Reservations run in transactions of at most 5 s, timed by their start. A
// month is closed only once no such transaction can still be committing to it.
const closeDelayMs = 60 * 60 * 1000;

const nextMonth = (monthStart: Date) =>
  new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );

/** PostgreSQL 40001, raised when a concurrent close commits the same month. */
function isSerializationFailure(error: unknown): boolean {
  const meta = (error as { meta?: { code?: unknown } } | null)?.meta;
  return (
    meta?.code === '40001' ||
    (error instanceof Error && /\b40001\b/.test(error.message))
  );
}

interface LineRow {
  projectId: string;
  projectName: string;
  source: UsageSource;
  apiKeyId: string | null;
  apiKeyName: string | null;
  apiKeyPrefix: string | null;
  events: bigint;
  requests: bigint;
  characters: bigint;
}

/** Ledger totals, counter and plan for one organization and month. */
async function summarize(
  tx: Prisma.TransactionClient,
  organizationId: string,
  monthStart: Date,
  now: Date,
) {
  const month = monthStart.toISOString();
  const lines = await tx.$queryRaw<LineRow[]>`
    SELECT e.project_id AS "projectId", p.name AS "projectName", e.source,
           e.api_key_id AS "apiKeyId", k.name AS "apiKeyName", k.prefix AS "apiKeyPrefix",
           count(*)::bigint AS events,
           sum(e.request_units)::bigint AS requests,
           sum(e.characters)::bigint AS characters
    FROM usage_events e
    JOIN projects p ON p.id = e.project_id
    LEFT JOIN api_keys k ON k.id = e.api_key_id
    WHERE e.organization_id = ${organizationId}::uuid
      AND e.month_start = ${month}::timestamptz
    GROUP BY e.project_id, p.name, e.source, e.api_key_id, k.name, k.prefix
    ORDER BY p.name, e.project_id, e.source, k.name NULLS FIRST, e.api_key_id`;
  const [counter] = await tx.$queryRaw<
    { requestCount: bigint; characterCount: bigint }[]
  >`
    SELECT request_count AS "requestCount", character_count AS "characterCount"
    FROM organization_quotas
    WHERE organization_id = ${organizationId}::uuid
      AND month_start = ${month}::timestamptz`;
  const end = nextMonth(monthStart);
  const planAt = now < end ? now : new Date(end.getTime() - 1);
  const plan = await readPlan(tx, organizationId, planAt);
  const sum = (pick: (line: LineRow) => bigint) =>
    lines.reduce((total, line) => total + pick(line), 0n);
  const requestCount = sum((line) => line.requests);
  const characterCount = sum((line) => line.characters);
  const counterRequests = counter?.requestCount ?? 0n;
  const counterCharacters = counter?.characterCount ?? 0n;
  return {
    requestCount,
    characterCount,
    eventCount: sum((line) => line.events),
    counterRequests,
    counterCharacters,
    reconciled:
      requestCount === counterRequests && characterCount === counterCharacters,
    plan: storeTerms(plan) satisfies StatementPlan,
    // Billable usage is the ledger, not the counter (they differ only in the
    // month metering was deployed).
    charges: storeCharges(
      priceUsage(plan, { requests: requestCount, characters: characterCount }),
    ),
    lines: lines as StatementLine[],
  };
}

type StoredLine = Omit<StatementLine, 'events' | 'requests' | 'characters'> & {
  events: string;
  requests: string;
  characters: string;
};

const storeLines = (lines: readonly StatementLine[]): StoredLine[] =>
  lines.map((line) => ({
    ...line,
    events: line.events.toString(),
    requests: line.requests.toString(),
    characters: line.characters.toString(),
  }));

const loadLines = (value: unknown): StatementLine[] =>
  ((value as { lines?: StoredLine[] }).lines ?? []).map((line) => ({
    ...line,
    events: BigInt(line.events),
    requests: BigInt(line.requests),
    characters: BigInt(line.characters),
  }));

export class PrismaUsageLedgerRepository
  implements UsageLedgerRepository, OnApplicationShutdown
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

  currentMonth() {
    return this.client.$transaction(
      async (tx) => quotaPeriod(await databaseTime(tx)).monthStart,
    );
  }

  statement(
    organizationId: string,
    monthStart: Date,
  ): Promise<UsageStatementRecord> {
    return this.client.$transaction(
      async (tx) => {
        const now = await databaseTime(tx);
        const stored = await tx.usageStatement.findUnique({
          where: { organizationId_monthStart: { organizationId, monthStart } },
        });
        if (stored)
          return {
            organizationId,
            monthStart,
            status: 'closed' as const,
            requestCount: stored.requestCount,
            characterCount: stored.characterCount,
            eventCount: stored.eventCount,
            counterRequests: stored.counterRequests,
            counterCharacters: stored.counterCharacters,
            reconciled: stored.reconciled,
            plan: stored.plan as unknown as StatementPlan,
            charges: stored.charges as unknown as StoredCharges | null,
            lines: loadLines(stored.breakdown),
            closedAt: stored.closedAt,
            generatedAt: now,
          };
        return {
          organizationId,
          monthStart,
          status: 'open' as const,
          ...(await summarize(tx, organizationId, monthStart, now)),
          closedAt: null,
          generatedAt: now,
        };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 10_000 },
    );
  }

  async events(
    organizationId: string,
    monthStart: Date,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<LedgerEvent[]> {
    const rows = await this.client.usageEvent.findMany({
      where: {
        organizationId,
        monthStart,
        ...(after
          ? {
              OR: [
                { createdAt: { gt: after.createdAt } },
                { createdAt: after.createdAt, id: { gt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
      select: {
        id: true,
        createdAt: true,
        requestId: true,
        projectId: true,
        source: true,
        endpoint: true,
        requestUnits: true,
        characters: true,
        project: { select: { name: true } },
        apiKey: { select: { prefix: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      requestId: row.requestId,
      projectId: row.projectId,
      projectName: row.project.name,
      source: row.source as UsageSource,
      apiKeyPrefix: row.apiKey?.prefix ?? null,
      endpoint: row.endpoint,
      requestUnits: row.requestUnits,
      characters: row.characters,
    }));
  }

  async closeFinishedMonths(): Promise<ClosedMonth[]> {
    const closed: ClosedMonth[] = [];
    const delay = `${closeDelayMs} milliseconds`;
    // Every ledger row increments its organization_quotas row in the same
    // transaction, so the counter table lists every month with usage. Months
    // on a subscription are closed even without traffic, so the base fee is
    // billed. Months are UTC; a subscription bills a month when it is in
    // effect at the month's last millisecond, as summarize() reads the plan.
    const pending = await this.client.$queryRaw<
      { organizationId: string; monthStart: Date }[]
    >`
      WITH candidates AS (
        SELECT q.organization_id, q.month_start FROM organization_quotas q
        UNION
        SELECT s.organization_id, g.m AT TIME ZONE 'UTC'
        FROM subscriptions s
        CROSS JOIN LATERAL generate_series(
          -- Never bill months before the subscription was recorded.
          date_trunc('month', GREATEST(s.starts_at, s.created_at) AT TIME ZONE 'UTC'),
          date_trunc('month', LEAST(COALESCE(s.ends_at, CURRENT_TIMESTAMP), CURRENT_TIMESTAMP)
            AT TIME ZONE 'UTC'),
          interval '1 month') AS g(m)
        WHERE s.status = 'active'
          AND s.starts_at <= ((g.m + interval '1 month') AT TIME ZONE 'UTC') - interval '1 millisecond'
          AND (s.ends_at IS NULL
               OR s.ends_at > ((g.m + interval '1 month') AT TIME ZONE 'UTC') - interval '1 millisecond')
      )
      SELECT c.organization_id AS "organizationId", c.month_start AS "monthStart"
      FROM candidates c
      WHERE ((c.month_start AT TIME ZONE 'UTC' + interval '1 month') AT TIME ZONE 'UTC')
              + ${delay}::interval <= CURRENT_TIMESTAMP
        AND NOT EXISTS (
          SELECT 1 FROM usage_statements s
          WHERE s.organization_id = c.organization_id AND s.month_start = c.month_start)
      ORDER BY c.month_start, c.organization_id
      LIMIT ${closeBatch}`;
    for (const { organizationId, monthStart } of pending) {
      const result = await this.client
        .$transaction(
          async (tx) => {
            const now = await databaseTime(tx);
            const summary = await summarize(
              tx,
              organizationId,
              monthStart,
              now,
            );
            // A concurrent close of the same month keeps the first statement.
            const inserted = await tx.$executeRaw`
            INSERT INTO usage_statements (organization_id, month_start, request_count,
              character_count, event_count, counter_requests, counter_characters,
              reconciled, plan, breakdown, charges)
            VALUES (${organizationId}::uuid, ${monthStart.toISOString()}::timestamptz,
              ${summary.requestCount}, ${summary.characterCount}, ${summary.eventCount},
              ${summary.counterRequests}, ${summary.counterCharacters}, ${summary.reconciled},
              ${JSON.stringify(summary.plan)}::jsonb,
              ${JSON.stringify({ lines: storeLines(summary.lines) })}::jsonb,
              ${JSON.stringify(summary.charges)}::jsonb)
            ON CONFLICT (organization_id, month_start) DO NOTHING`;
            return inserted === 1 ? summary.reconciled : null;
          },
          { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 30_000 },
        )
        // Another close run inserted this month first; it keeps its statement.
        .catch((error: unknown) => {
          if (isSerializationFailure(error)) return null;
          throw error;
        });
      if (result !== null)
        closed.push({ organizationId, monthStart, reconciled: result });
    }
    return closed;
  }

  billing(organizationId: string): Promise<BillingOverview> {
    return this.client.$transaction(
      async (tx) => {
        const now = await databaseTime(tx);
        const { monthStart } = quotaPeriod(now);
        const plan = await readPlan(tx, organizationId, now);
        const [current] = await tx.$queryRaw<{ description: string | null }[]>`
          SELECT description FROM plans WHERE slug = ${plan.slug}`;
        const [usage] = await tx.$queryRaw<
          { requests: bigint | null; characters: bigint | null }[]
        >`
          SELECT sum(request_units)::bigint AS requests, sum(characters)::bigint AS characters
          FROM usage_events
          WHERE organization_id = ${organizationId}::uuid
            AND month_start = ${monthStart.toISOString()}::timestamptz`;
        const requests = usage?.requests ?? 0n;
        const characters = usage?.characters ?? 0n;
        const subscriptions = await tx.subscription.findMany({
          where: { organizationId, status: 'active' },
          orderBy: [{ startsAt: 'desc' }, { id: 'asc' }],
          take: 50,
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            note: true,
            plan: { select: { name: true, slug: true } },
          },
        });
        const publicPlans = await tx.plan.findMany({
          where: { public: true, archivedAt: null },
          orderBy: [{ baseFeeMinor: 'asc' }, { slug: 'asc' }],
        });
        return {
          now,
          plan: {
            ...storeTerms(plan),
            source: plan.source,
            description: current?.description ?? null,
          },
          subscriptions,
          month: {
            monthStart,
            requests,
            characters,
            charges: storeCharges(priceUsage(plan, { requests, characters })),
          },
          publicPlans: publicPlans.map((row) => ({
            ...storeTerms({
              ...row,
              currency: row.currency.trim(),
              overageMode: row.overageMode === 'allow' ? 'allow' : 'block',
            }),
            description: row.description,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead', maxWait: 2_000, timeout: 10_000 },
    );
  }

  cleanup(before: Date) {
    return this.client.$executeRaw`
      DELETE FROM usage_events WHERE id IN (
        SELECT e.id FROM usage_events e
        WHERE e.month_start < ${before.toISOString()}::timestamptz
          AND EXISTS (
            SELECT 1 FROM usage_statements s
            WHERE s.organization_id = e.organization_id AND s.month_start = e.month_start)
        ORDER BY e.month_start
        LIMIT ${cleanupBatch}
        FOR UPDATE SKIP LOCKED)`;
  }
}
