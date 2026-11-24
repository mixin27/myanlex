import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PlanAdmin } from '../src/infrastructure/database/plan-admin.js';
import {
  MAX_ATTEMPTS,
  UsageAlerts,
} from '../src/infrastructure/database/usage-alerts.js';
import { quotaPeriod } from '../src/common/quota/quota-period.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('Usage alerts on PostgreSQL', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const plans = new PlanAdmin(databaseUrl!);
  const alerts = new UsageAlerts(databaseUrl!);
  afterAll(async () => {
    await Promise.all([client.$disconnect(), plans.close(), alerts.close()]);
  });

  const { monthStart } = quotaPeriod(new Date());
  const lastMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1),
  );

  async function plan(overrides: Record<string, unknown> = {}) {
    const definition = {
      slug: `ua-${randomUUID().slice(0, 8)}`,
      name: 'Small',
      public: false,
      currency: 'MMK',
      baseFeeMinor: 0,
      monthlyRequestLimit: 100,
      monthlyCharacterLimit: null,
      overageMode: 'block',
      ...overrides,
    };
    await plans.upsert(definition);
    return client.plan.findUniqueOrThrow({ where: { slug: definition.slug } });
  }

  /** A workspace on `planId` with `requests` used this month. */
  async function workspace(planId: string, requests: number) {
    const organization = await client.organization.create({
      data: { name: 'Lotus Media', slug: `ua-${randomUUID()}` },
    });
    await client.subscription.create({
      data: {
        organizationId: organization.id,
        planId,
        status: 'active',
        startsAt: new Date('2020-01-01T00:00:00Z'),
      },
    });
    await setUsage(organization.id, requests);
    return organization.id;
  }

  const setUsage = (
    organizationId: string,
    requests: number,
    month = monthStart,
  ) =>
    client.organizationQuota.upsert({
      where: {
        organizationId_monthStart: { organizationId, monthStart: month },
      },
      create: {
        organizationId,
        monthStart: month,
        requestCount: BigInt(requests),
        characterCount: 0n,
      },
      update: { requestCount: BigInt(requests) },
    });

  const rows = (organizationId: string) =>
    client.usageAlert.findMany({
      where: { organizationId },
      orderBy: { kind: 'asc' },
      select: {
        kind: true,
        dimension: true,
        used: true,
        thresholdValue: true,
        limitValue: true,
        sentAt: true,
        attempts: true,
      },
    });

  it('records each crossed threshold once, even with concurrent scans', async () => {
    const small = await plan();
    const quiet = await workspace(small.id, 79);
    const busy = await workspace(small.id, 80);
    await Promise.all([alerts.scan(), alerts.scan(), alerts.scan()]);
    expect(await rows(quiet)).toEqual([]);
    expect(await rows(busy)).toEqual([
      {
        kind: 'allowance_80',
        dimension: 'requests',
        used: 80n,
        thresholdValue: 80n,
        limitValue: 100n,
        sentAt: null,
        attempts: 0,
      },
    ]);
    await setUsage(busy, 100);
    await alerts.scan();
    expect((await rows(busy)).map((row) => row.kind)).toEqual([
      'allowance_100',
      'allowance_80',
    ]);
  });

  it('does not re-alert after an upgrade, and alerts again next month', async () => {
    const small = await plan();
    const big = await plan({ monthlyRequestLimit: 1_000 });
    const id = await workspace(small.id, 90);
    await alerts.scan();
    await client.subscription.updateMany({
      where: { organizationId: id },
      data: { planId: big.id },
    });
    await alerts.scan();
    expect((await rows(id)).map((row) => row.kind)).toEqual(['allowance_80']);
    // Last month's alert does not stop this month's.
    await client.usageAlert.updateMany({
      where: { organizationId: id },
      data: { monthStart: lastMonth },
    });
    await setUsage(id, 900);
    await alerts.scan();
    expect(
      await client.usageAlert.count({
        where: { organizationId: id, monthStart },
      }),
    ).toBe(1);
  });

  it('adds ceiling alerts on overage plans', async () => {
    const overage = await plan({
      overageMode: 'allow',
      requestBlock: 10,
      requestBlockPriceMinor: 100,
      requestCeiling: 200,
    });
    const id = await workspace(overage.id, 180);
    await alerts.scan();
    expect((await rows(id)).map((row) => [row.kind, row.limitValue])).toEqual([
      ['allowance_100', 100n],
      ['allowance_80', 100n],
      ['ceiling_90', 200n],
    ]);
  });

  it('lists this month’s unsent alerts and stops after three attempts', async () => {
    const small = await plan();
    const id = await workspace(small.id, 85);
    await alerts.scan();
    const mine = async () =>
      (await alerts.pending()).filter(
        (pending) => pending.alert.organizationId === id,
      );
    const [first] = await mine();
    expect(first).toMatchObject({
      organizationName: 'Lotus Media',
      plan: { slug: small.slug },
      alert: { kind: 'allowance_80' },
    });
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      expect(await mine()).toHaveLength(1);
      await alerts.markFailed(first!.alert.id);
    }
    expect(await mine()).toEqual([]);

    const sent = await workspace(small.id, 85);
    await alerts.scan();
    const [pending] = (await alerts.pending()).filter(
      (row) => row.alert.organizationId === sent,
    );
    await alerts.markSent(pending!.alert.id);
    expect((await rows(sent))[0]).toMatchObject({
      attempts: 1,
      sentAt: expect.any(Date),
    });
    expect(
      (await alerts.pending()).some((row) => row.alert.organizationId === sent),
    ).toBe(false);
  });

  it('never sends a past month’s alert late, and cleans up old months', async () => {
    const small = await plan();
    const id = await workspace(small.id, 0);
    await setUsage(id, 100, lastMonth);
    await alerts.scan();
    // Only the current month is scanned.
    expect(await rows(id)).toEqual([]);
    await client.usageAlert.create({
      data: {
        organizationId: id,
        monthStart: lastMonth,
        kind: 'allowance_80',
        dimension: 'requests',
        used: 80n,
        thresholdValue: 80n,
        limitValue: 100n,
        planSlug: small.slug,
      },
    });
    expect(
      (await alerts.pending()).some((row) => row.alert.organizationId === id),
    ).toBe(false);
    await alerts.cleanup(monthStart);
    expect(await rows(id)).toEqual([]);
  });
});
