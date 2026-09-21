import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaQuotaRepository } from '../src/infrastructure/database/prisma-quota.repository.js';
import { createApiApplication } from '../src/create-api-application.js';
import { hashApiKey } from '../src/common/auth/api-key-authentication.service.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;

async function fixture(
  requestLimit: bigint | null,
  characterLimit: bigint | null,
) {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const nonUtcUrl = new URL(databaseUrl!);
  nonUtcUrl.searchParams.set('options', '-c TimeZone=Pacific/Honolulu');
  const repositories = [
    new PrismaQuotaRepository(databaseUrl!),
    new PrismaQuotaRepository(nonUtcUrl.toString()),
  ];
  const organization = await client.organization.create({
    data: { name: 'Quota test', slug: `quota-${randomUUID()}` },
  });
  const other = await client.organization.create({
    data: { name: 'Other tenant', slug: `quota-${randomUUID()}` },
  });
  const plan = await client.plan.create({
    data: {
      name: 'Quota fixture',
      slug: `quota-${randomUUID()}`,
      monthlyRequestLimit: requestLimit,
      monthlyCharacterLimit: characterLimit,
    },
  });
  const projects = await Promise.all(
    [organization.id, organization.id, other.id].map((organizationId, index) =>
      client.project.create({
        data: {
          organizationId,
          name: 'Test',
          slug: `test-${index}`,
          environment: 'development',
        },
      }),
    ),
  );
  await client.subscription.createMany({
    data: [organization.id, other.id].map((organizationId) => ({
      organizationId,
      planId: plan.id,
      status: 'active',
      startsAt: new Date('2020-01-01T00:00:00Z'),
    })),
  });
  return {
    client,
    repositories,
    organization,
    other,
    plan,
    projects,
    async cleanup() {
      await client.apiUsage.deleteMany({
        where: {
          project: { organizationId: { in: [organization.id, other.id] } },
        },
      });
      await client.organization.deleteMany({
        where: { id: { in: [organization.id, other.id] } },
      });
      await client.plan.delete({ where: { id: plan.id } });
      await Promise.all([
        client.$disconnect(),
        ...repositories.map((repository) => repository.onApplicationShutdown()),
      ]);
    },
  };
}

describe.skipIf(!databaseUrl)('Durable organization quotas', () => {
  it('atomically shares both dimensions across projects and instances, without crossing tenants', async () => {
    const f = await fixture(5n, 10n);
    try {
      expect(await f.repositories[0]!.read(f.organization.id)).toMatchObject({
        requestCount: 0n,
        characterCount: 0n,
        plan: { source: 'subscription', monthlyRequestLimit: 5n },
      });
      expect(
        await f.client.organizationQuota.count({
          where: { organizationId: f.organization.id },
        }),
      ).toBe(0);
      const results = await Promise.all(
        Array.from({ length: 24 }, (_, index) =>
          f.repositories[index % 2]!.consume(f.projects[index % 2]!.id, 2),
        ),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(5);
      const rows = await f.client.organizationQuota.findMany({
        where: { organizationId: f.organization.id },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ requestCount: 5n, characterCount: 10n });
      const snapshot = await f.repositories[1]!.read(f.organization.id);
      expect(Math.abs(Date.now() - snapshot.now.getTime())).toBeLessThan(
        10_000,
      );
      expect(snapshot).toMatchObject({ requestCount: 5n, characterCount: 10n });
      expect(snapshot.monthStart).toEqual(rows[0]!.monthStart);
      expect(snapshot.resetsAt.getTime()).toBeGreaterThan(
        snapshot.now.getTime(),
      );
      expect((await f.repositories[1]!.read(f.other.id)).requestCount).toBe(0n);
      expect(
        await f.client.organizationQuota.findMany({
          where: { organizationId: f.organization.id },
        }),
      ).toEqual(rows);
      expect(rows[0]!.monthStart.toISOString()).toMatch(/-01T00:00:00.000Z$/);
      expect(
        (await f.repositories[0]!.consume(f.projects[2]!.id, 2)).allowed,
      ).toBe(true);
      // A new adapter/process reads the existing durable allowance.
      const restarted = new PrismaQuotaRepository(databaseUrl!);
      try {
        expect((await restarted.consume(f.projects[0]!.id, 0)).allowed).toBe(
          false,
        );
      } finally {
        await restarted.onApplicationShutdown();
      }
    } finally {
      await f.cleanup();
    }
  });

  it('uses UTC subscription boundaries in non-UTC database sessions', async () => {
    const f = await fixture(0n, 0n);
    try {
      const now = (await f.repositories[0]!.read(f.organization.id)).now;
      await f.client.subscription.updateMany({
        where: { organizationId: f.organization.id },
        data: { startsAt: new Date(now.getTime() + 3_600_000) },
      });
      expect(
        (await f.repositories[1]!.read(f.organization.id)).plan.source,
      ).toBe('free');
      expect(
        (await f.repositories[1]!.consume(f.projects[0]!.id, 1)).allowed,
      ).toBe(true);
      await f.client.subscription.updateMany({
        where: { organizationId: f.organization.id },
        data: {
          startsAt: new Date(now.getTime() - 3_600_000),
          endsAt: new Date(now.getTime() + 3_600_000),
        },
      });
      expect(
        (await f.repositories[1]!.read(f.organization.id)).plan.source,
      ).toBe('subscription');
      expect(
        (await f.repositories[1]!.consume(f.projects[0]!.id, 0)).allowed,
      ).toBe(false);
      await f.client.subscription.updateMany({
        where: { organizationId: f.organization.id },
        data: { endsAt: new Date(now.getTime() - 1) },
      });
      expect(
        (await f.repositories[1]!.read(f.organization.id)).plan.source,
      ).toBe('free');
    } finally {
      await f.cleanup();
    }
  });

  it('rejects character overflow without spending requests and applies plan changes without resetting counters', async () => {
    const f = await fixture(null, 3n);
    try {
      const repository = f.repositories[0]!;
      const projectId = f.projects[0]!.id;
      expect((await repository.consume(projectId, 4)).allowed).toBe(false);
      expect((await repository.consume(projectId, 3)).allowed).toBe(true);
      expect((await repository.consume(projectId, 1)).allowed).toBe(false);
      expect(
        await f.client.organizationQuota.findFirst({
          where: { organizationId: f.organization.id },
        }),
      ).toMatchObject({ requestCount: 1n, characterCount: 3n });
      await f.client.plan.update({
        where: { id: f.plan.id },
        data: { monthlyCharacterLimit: null, monthlyRequestLimit: 2n },
      });
      expect((await repository.consume(projectId, 100)).allowed).toBe(true);
      expect((await repository.consume(projectId, 0)).allowed).toBe(false);
      await f.client.plan.update({
        where: { id: f.plan.id },
        data: { monthlyRequestLimit: 0n },
      });
      expect((await repository.consume(f.projects[2]!.id, 0)).allowed).toBe(
        false,
      );
      await f.client.plan.update({
        where: { id: f.plan.id },
        data: { monthlyRequestLimit: -1n },
      });
      await expect(repository.consume(projectId, 0)).rejects.toThrow(
        'Invalid plan limits',
      );
    } finally {
      await f.cleanup();
    }
  });

  it('uses Free without a current active subscription, ignores past months, and refuses ambiguous subscriptions', async () => {
    const f = await fixture(0n, 0n);
    try {
      await f.client.subscription.updateMany({
        where: { organizationId: f.organization.id },
        data: { endsAt: new Date('2021-01-01T00:00:00Z') },
      });
      await f.client.organizationQuota.create({
        data: {
          organizationId: f.organization.id,
          monthStart: new Date('2000-01-01T00:00:00Z'),
          requestCount: 999999n,
          characterCount: 999999999n,
        },
      });
      const repository = f.repositories[0]!;
      expect((await repository.consume(f.projects[0]!.id, 1)).allowed).toBe(
        true,
      );
      const free = await f.client.plan.findUniqueOrThrow({
        where: { slug: 'free' },
      });
      expect(free.monthlyRequestLimit).not.toBeNull();
      await f.client.organizationQuota.updateMany({
        where: {
          organizationId: f.organization.id,
          monthStart: { gt: new Date('2020-01-01T00:00:00Z') },
        },
        data: { requestCount: free.monthlyRequestLimit! },
      });
      expect((await repository.consume(f.projects[0]!.id, 0)).allowed).toBe(
        false,
      );
      await f.client.subscription.createMany({
        data: [1, 2].map(() => ({
          organizationId: f.organization.id,
          planId: f.plan.id,
          status: 'active',
          startsAt: new Date('2020-01-01T00:00:00Z'),
        })),
      });
      await expect(repository.consume(f.projects[0]!.id, 0)).rejects.toThrow(
        'Ambiguous active subscription',
      );
    } finally {
      await f.cleanup();
    }
  });

  it('enforces HTTP quotas after authorization, counts batches/code points and validation failures, and remains opt-in', async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    const f = await fixture(2n, 4n);
    const secret = `quota-${randomUUID()}`;
    const permission = await f.client.permission.upsert({
      where: { key: 'api.invoke' },
      update: {},
      create: { key: 'api.invoke', description: 'Invoke NLP API' },
    });
    await f.client.apiKey.create({
      data: {
        projectId: f.projects[0]!.id,
        name: 'Test',
        prefix: 'test',
        keyHash: hashApiKey(secret),
        scopes: { create: { permissionId: permission.id } },
      },
    });
    const app = await createApiApplication({
      databaseUrl: databaseUrl!,
      apiKey: 'quota-bootstrap',
      quotasEnabled: true,
      rateLimitMaxRequests: 1000,
      logger: false,
    });
    const headers = { authorization: `Bearer ${secret}` };
    try {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/text/normalize',
            payload: { text: 'unauthorized' },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/text/normalize',
            headers: { authorization: 'Bearer quota-bootstrap' },
            payload: { text: 'bootstrap' },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        await f.client.organizationQuota.count({
          where: { organizationId: f.organization.id },
        }),
      ).toBe(0);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/batch/syllabify',
            headers,
            payload: {
              items: [
                { id: 'a', text: 'က😀' },
                { id: 'b', text: 'က😀' },
              ],
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/text/normalize',
            headers,
            payload: { text: 123 },
          })
        ).statusCode,
      ).toBe(400);
      const denied = await app.inject({
        method: 'POST',
        url: '/v1/text/normalize',
        headers,
        payload: { text: 'က' },
      });
      expect(denied.statusCode).toBe(429);
      expect(denied.json().code).toBe('quota_exceeded');
      expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
      expect(
        await f.client.organizationQuota.findFirst({
          where: { organizationId: f.organization.id },
        }),
      ).toMatchObject({ requestCount: 2n, characterCount: 4n });
      const disabled = await createApiApplication({
        databaseUrl: databaseUrl!,
        quotasEnabled: false,
        logger: false,
      });
      try {
        expect(
          (
            await disabled.inject({
              method: 'POST',
              url: '/v1/text/normalize',
              headers,
              payload: { text: 'က' },
            })
          ).statusCode,
        ).toBe(200);
      } finally {
        await disabled.close();
      }
      await f.client.plan.update({
        where: { id: f.plan.id },
        data: { monthlyRequestLimit: -1n },
      });
      const unavailable = await app.inject({
        method: 'POST',
        url: '/v1/text/normalize',
        headers,
        payload: { text: 'က' },
      });
      expect(unavailable.statusCode).toBe(503);
      expect(unavailable.json().code).toBe('service_unavailable');
    } finally {
      await app.close();
      await f.cleanup();
      vi.unstubAllEnvs();
    }
  });
});
