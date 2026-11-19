import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaQuotaRepository } from '../src/infrastructure/database/prisma-quota.repository.js';
import { PrismaUsageLedgerRepository } from '../src/infrastructure/database/prisma-usage-ledger.repository.js';
import { createApiApplication } from '../src/create-api-application.js';
import { hashApiKey } from '../src/common/auth/api-key-authentication.service.js';
import type { MeterInput } from '../src/common/quota/quota.repository.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;

async function fixture(requestLimit: bigint | null) {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const quotas = [
    new PrismaQuotaRepository(databaseUrl!),
    new PrismaQuotaRepository(databaseUrl!),
  ];
  const ledger = new PrismaUsageLedgerRepository(databaseUrl!);
  const organization = await client.organization.create({
    data: { name: 'Metering', slug: `meter-${randomUUID()}` },
  });
  const plan = await client.plan.create({
    data: {
      name: 'Metering fixture',
      slug: `meter-${randomUUID()}`,
      monthlyRequestLimit: requestLimit,
      monthlyCharacterLimit: null,
    },
  });
  await client.subscription.create({
    data: {
      organizationId: organization.id,
      planId: plan.id,
      status: 'active',
      startsAt: new Date('2020-01-01T00:00:00Z'),
    },
  });
  const project = await client.project.create({
    data: { organizationId: organization.id, name: 'Docs', slug: 'docs' },
  });
  const key = await client.apiKey.create({
    data: {
      projectId: project.id,
      name: 'CI',
      prefix: `mlx_${randomUUID().slice(0, 6)}`,
      keyHash: hashApiKey(`meter-${randomUUID()}`),
    },
  });
  const meter = (
    overrides: Partial<MeterInput> = {},
    repository = quotas[0]!,
  ) =>
    repository.meter({
      projectId: project.id,
      characters: 2,
      enforce: true,
      source: 'api_key',
      apiKeyId: key.id,
      endpoint: '/v1/text/normalize',
      requestId: 'req-1',
      ...overrides,
    });
  const events = () =>
    client.usageEvent.findMany({
      where: { organizationId: organization.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  const counters = () =>
    client.organizationQuota.findMany({
      where: { organizationId: organization.id },
    });
  /** Seeds a finished month directly, as earlier traffic would have left it. */
  async function seedMonth(monthStart: Date, count: number, extraCounter = 0n) {
    await client.organizationQuota.create({
      data: {
        organizationId: organization.id,
        monthStart,
        requestCount: BigInt(count) + extraCounter,
        characterCount: BigInt(count * 3),
      },
    });
    await client.usageEvent.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        id: randomUUID(),
        organizationId: organization.id,
        projectId: project.id,
        apiKeyId: key.id,
        source: 'api_key',
        monthStart,
        characters: 3n,
        endpoint: '/v1/text/normalize',
        createdAt: new Date(monthStart.getTime() + index * 1000),
      })),
    });
  }
  return {
    client,
    quotas,
    ledger,
    organization,
    plan,
    project,
    key,
    meter,
    events,
    counters,
    seedMonth,
    async cleanup() {
      await client.apiUsage.deleteMany({ where: { projectId: project.id } });
      await client.organization.delete({ where: { id: organization.id } });
      await client.plan.delete({ where: { id: plan.id } });
      await Promise.all([
        client.$disconnect(),
        ledger.onApplicationShutdown(),
        ...quotas.map((repository) => repository.onApplicationShutdown()),
      ]);
    },
  };
}

describe.skipIf(!databaseUrl)('Billing-grade usage metering', () => {
  it('writes exactly one ledger row with each admitted reservation, and none when denied', async () => {
    const f = await fixture(2n);
    try {
      const first = await f.meter({ requestId: 'req-a' });
      expect(first).toMatchObject({
        allowed: true,
        eventId: expect.any(String),
      });
      await f.meter({ source: 'playground', apiKeyId: null, characters: 5 });
      const denied = await f.meter();
      expect(denied).toMatchObject({ allowed: false, eventId: null });
      const events = await f.events();
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        id: first.eventId,
        projectId: f.project.id,
        apiKeyId: f.key.id,
        source: 'api_key',
        characters: 2n,
        requestUnits: 1,
        endpoint: '/v1/text/normalize',
        requestId: 'req-a',
      });
      const [counter] = await f.counters();
      expect(counter).toMatchObject({ requestCount: 2n, characterCount: 7n });
      expect(
        events.every((event) => +event.monthStart === +counter!.monthStart),
      ).toBe(true);

      // Unenforced: still metered, never denied by the exhausted limit.
      expect(await f.meter({ enforce: false })).toMatchObject({
        allowed: true,
      });
      expect(await f.events()).toHaveLength(3);
      expect((await f.counters())[0]!.requestCount).toBe(3n);

      await expect(
        f.meter({ source: 'api_key', apiKeyId: null }),
      ).rejects.toThrow('Invalid usage source');
    } finally {
      await f.cleanup();
    }
  });

  it('keeps the ledger equal to the counter under concurrent reservations', async () => {
    const f = await fixture(30n);
    try {
      const results = await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          f.meter({ characters: index % 3 }, f.quotas[index % 2]),
        ),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(30);
      const statement = await f.ledger.statement(
        f.organization.id,
        (await f.counters())[0]!.monthStart,
      );
      expect(statement).toMatchObject({
        status: 'open',
        requestCount: 30n,
        eventCount: 30n,
        counterRequests: 30n,
        reconciled: true,
      });
      expect(statement.characterCount).toBe(statement.counterCharacters);
      expect(statement.lines).toHaveLength(1);
      expect(statement.lines[0]).toMatchObject({
        projectName: 'Docs',
        apiKeyName: 'CI',
        apiKeyPrefix: f.key.prefix,
        requests: 30n,
      });
    } finally {
      await f.cleanup();
    }
  });

  it('rejects edits to ledger rows and closed statements', async () => {
    const f = await fixture(null);
    try {
      await f.meter();
      await expect(
        f.client.usageEvent.updateMany({
          where: { organizationId: f.organization.id },
          data: { characters: 0n },
        }),
      ).rejects.toThrow();
      await f.seedMonth(new Date('2026-08-01T00:00:00Z'), 1);
      await f.ledger.closeFinishedMonths();
      await expect(
        f.client.usageStatement.updateMany({
          where: { organizationId: f.organization.id },
          data: { reconciled: false },
        }),
      ).rejects.toThrow();
      await expect(
        f.client.usageStatement.deleteMany({
          where: { organizationId: f.organization.id },
        }),
      ).rejects.toThrow();
    } finally {
      await f.cleanup();
    }
    expect(
      await f.client.usageStatement.count({
        where: { organizationId: f.organization.id },
      }),
    ).toBe(0);
  });

  it('closes finished months once, flags mismatches, and keeps the open month live', async () => {
    const f = await fixture(null);
    try {
      const august = new Date('2026-08-01T00:00:00Z');
      const september = new Date('2026-09-01T00:00:00Z');
      await f.seedMonth(august, 4);
      await f.seedMonth(september, 2, 3n);
      await f.meter();
      const current = await f.ledger.currentMonth();

      const closed = (await f.ledger.closeFinishedMonths()).filter(
        (month) => month.organizationId === f.organization.id,
      );
      expect(closed).toEqual([
        {
          organizationId: f.organization.id,
          monthStart: august,
          reconciled: true,
        },
        {
          organizationId: f.organization.id,
          monthStart: september,
          reconciled: false,
        },
      ]);
      expect(
        (await f.ledger.closeFinishedMonths()).filter(
          (month) => month.organizationId === f.organization.id,
        ),
      ).toEqual([]);

      expect(await f.ledger.statement(f.organization.id, august)).toMatchObject(
        {
          status: 'closed',
          requestCount: 4n,
          characterCount: 12n,
          reconciled: true,
          plan: { slug: f.plan.slug, monthlyRequestLimit: null },
          lines: [
            { apiKeyPrefix: f.key.prefix, requests: 4n, characters: 12n },
          ],
          closedAt: expect.any(Date),
        },
      );
      expect(
        await f.ledger.statement(f.organization.id, september),
      ).toMatchObject({
        status: 'closed',
        requestCount: 2n,
        counterRequests: 5n,
        reconciled: false,
      });
      expect(
        await f.ledger.statement(f.organization.id, current),
      ).toMatchObject({
        status: 'open',
        requestCount: 1n,
        reconciled: true,
        closedAt: null,
      });
      const page = await f.ledger.events(f.organization.id, august, null, 3);
      expect(page.map((event) => event.projectName)).toEqual([
        'Docs',
        'Docs',
        'Docs',
      ]);
      const rest = await f.ledger.events(
        f.organization.id,
        august,
        { createdAt: page[2]!.createdAt, id: page[2]!.id },
        3,
      );
      expect(rest).toHaveLength(1);
    } finally {
      await f.cleanup();
    }
  });

  it('cleans up only closed months before the retention cutoff', async () => {
    const f = await fixture(null);
    try {
      const old = new Date('2024-01-01T00:00:00Z');
      const recent = new Date('2026-09-01T00:00:00Z');
      await f.seedMonth(old, 3);
      await f.seedMonth(recent, 2);
      await f.ledger.closeFinishedMonths();
      // An old month with no statement yet (counter row missing) is kept.
      await f.client.usageEvent.create({
        data: {
          id: randomUUID(),
          organizationId: f.organization.id,
          projectId: f.project.id,
          apiKeyId: f.key.id,
          source: 'api_key',
          monthStart: new Date('2023-12-01T00:00:00Z'),
          characters: 1n,
          endpoint: '/v1/text/normalize',
          createdAt: new Date('2023-12-01T00:00:00Z'),
        },
      });
      let deleted = 0;
      for (let count = 500; count === 500; deleted += count)
        count = await f.ledger.cleanup(new Date('2025-01-01T00:00:00Z'));
      const remaining = await f.events();
      expect(remaining.some((event) => +event.monthStart === +old)).toBe(false);
      expect(
        remaining.filter((event) => +event.monthStart === +recent),
      ).toHaveLength(2);
      expect(
        remaining.some((event) => event.monthStart.getUTCFullYear() === 2023),
      ).toBe(true);
      expect(await f.ledger.statement(f.organization.id, old)).toMatchObject({
        status: 'closed',
        requestCount: 3n,
      });
    } finally {
      await f.cleanup();
    }
  });

  it('meters real API-key requests with enforcement off and links diagnostics', async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    const f = await fixture(0n);
    const secret = `meter-${randomUUID()}`;
    const permission = await f.client.permission.upsert({
      where: { key: 'api.invoke' },
      update: {},
      create: { key: 'api.invoke', description: 'Invoke NLP API' },
    });
    await f.client.apiKey.update({
      where: { id: f.key.id },
      data: {
        keyHash: hashApiKey(secret),
        scopes: { create: { permissionId: permission.id } },
      },
    });
    const app = await createApiApplication({
      databaseUrl: databaseUrl!,
      quotasEnabled: false,
      rateLimitMaxRequests: 1000,
      logger: false,
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/text/normalize',
        headers: { authorization: `Bearer ${secret}` },
        payload: { text: 'က😀' },
      });
      expect(response.statusCode).toBe(200);
      const invalid = await app.inject({
        method: 'POST',
        url: '/v1/text/normalize',
        headers: { authorization: `Bearer ${secret}` },
        payload: { text: 123 },
      });
      expect(invalid.statusCode).toBe(400);
      const events = await f.events();
      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        source: 'api_key',
        apiKeyId: f.key.id,
        characters: 2n,
        endpoint: '/v1/text/normalize',
        requestId: expect.any(String),
      });
      await vi.waitFor(async () =>
        expect(
          (
            await f.client.apiUsage.findMany({
              where: { projectId: f.project.id },
              orderBy: { id: 'asc' },
            })
          ).map((row) => row.usageEventId),
        ).toEqual(events.map((event) => event.id)),
      );
    } finally {
      await app.close();
      await f.cleanup();
      vi.unstubAllEnvs();
    }
  });
});
