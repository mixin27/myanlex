import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { asActor } from './actor.js';
import { describe, expect, it } from 'vitest';
import { createMyanLexApplication } from '@myanlex/application';
import { executeLocal } from '@myanlex/playground';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';
import { PrismaWorkspaceRepository } from '../src/infrastructure/database/prisma-workspace.repository.js';
import { ApiKeysService } from '../src/modules/platform/api-keys.service.js';
import { PrismaQuotaRepository } from '../src/infrastructure/database/prisma-quota.repository.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPlaygroundRepository } from '../src/infrastructure/database/prisma-playground.repository.js';
import {
  SaveConflict,
  SaveLimit,
} from '../src/modules/playground/playground.repository.js';

const url = process.env.MYANLEX_TEST_DATABASE_URL;
describe.skipIf(!url)('PostgreSQL private playground artifacts', () => {
  it('shares durable quotas between concurrent API-key and session executions', async () => {
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const workspace = new PrismaWorkspaceRepository(url!);
    const quota = new PrismaQuotaRepository(url!);
    const user = await client.user.create({
      data: {
        name: 'Mixed caller',
        email: randomUUID() + '@example.com',
        emailVerified: true,
      },
    });
    const organization = await workspace.createOrganization(asActor(user), {
      name: 'Mixed caller',
      slug: 'mixed-' + randomUUID(),
    });
    const project = await workspace.createProject(
      organization.id,
      {
        name: 'API',
        slug: 'api',
        environment: 'development',
      },
      asActor(user),
    );
    const plan = await client.plan.create({
      data: {
        name: 'Mixed fixture',
        slug: 'mixed-' + randomUUID(),
        monthlyRequestLimit: 5n,
        monthlyCharacterLimit: 10n,
      },
    });
    await client.subscription.create({
      data: {
        organizationId: organization.id,
        planId: plan.id,
        status: 'active',
        startsAt: new Date(0),
      },
    });
    const key = await new ApiKeysService(workspace).create(
      asActor(user),
      organization.id,
      project.id,
      { name: 'Fixture', scopes: ['api.invoke'] },
    );
    const app = await createApiApplication({
      logger: false,
      databaseUrl: url!,
      quotasEnabled: true,
      rateLimitMaxRequests: 1000,
    });
    Object.defineProperties(app.get(AccountAuthService), {
      auth: {
        value: {
          api: {
            getSession: async () => ({
              user: { id: user.id, emailVerified: true },
            }),
          },
        },
      },
      publicURL: { value: 'http://localhost:3000' },
    });
    try {
      const calls = Array.from({ length: 12 }, (_, index) =>
        index % 2 === 0
          ? app.inject({
              method: 'POST',
              url: '/v1/text/normalize',
              headers: { authorization: 'Bearer ' + key.secret },
              payload: { text: 'က😀' },
            })
          : app.inject({
              method: 'POST',
              url:
                '/v1/platform/organizations/' +
                organization.id +
                '/projects/' +
                project.id +
                '/playground/execute',
              headers: { cookie: 'valid', origin: 'http://localhost:3000' },
              payload: { operation: 'normalize', payload: { text: 'က😀' } },
            }),
      );
      const responses = await Promise.all(calls);
      expect(
        responses.filter((response) => response.statusCode === 200),
      ).toHaveLength(5);
      expect(
        responses.filter((response) => response.statusCode === 429),
      ).toHaveLength(7);
      expect(await quota.read(organization.id)).toMatchObject({
        requestCount: 5n,
        characterCount: 10n,
      });
      await expect
        .poll(
          async () =>
            client.apiUsage.count({ where: { projectId: project.id } }),
          { timeout: 5000 },
        )
        .toBe(5);
      const records = await client.apiUsage.findMany({
        where: { projectId: project.id },
      });
      for (const record of records)
        expect(
          record.source === 'playground'
            ? record.apiKeyId === null
            : record.apiKeyId === key.id,
        ).toBe(true);
    } finally {
      await app.close();
      await client.apiUsage.deleteMany({ where: { projectId: project.id } });
      await client.organization.delete({ where: { id: organization.id } });
      await client.user.delete({ where: { id: user.id } });
      await client.plan.delete({ where: { id: plan.id } });
      await Promise.all([
        client.$disconnect(),
        workspace.onApplicationShutdown(),
        quota.onApplicationShutdown(),
      ]);
    }
  }, 30_000);
  it('serializes concurrent caps, retries, ownership, rename and expiry cleanup', async () => {
    const client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url! }),
    });
    const repos = [
      new PrismaPlaygroundRepository(url!),
      new PrismaPlaygroundRepository(url!),
    ];
    const user = await client.user.create({
      data: {
        name: 'Playground fixture',
        email: `${randomUUID()}@example.com`,
      },
    });
    const organization = await client.organization.create({
      data: { name: 'Fixture', slug: `pg-${randomUUID()}` },
    });
    const project = await client.project.create({
      data: {
        organizationId: organization.id,
        name: 'Fixture',
        slug: 'fixture',
      },
    });
    const snapshot = executeLocal(
      createMyanLexApplication(),
      { operation: 'normalize', payload: { text: 'က😀' } },
      'test-revision',
      () => 0,
    );
    const input = { id: randomUUID(), title: 'Original', snapshot };
    try {
      // jsonb cannot preserve NUL or unpaired surrogate escapes, but artifacts must.
      for (const text of ['က\u0000😀', '\uD800']) {
        const artifact = executeLocal(
          createMyanLexApplication(),
          { operation: 'normalize', payload: { text } },
          'test-revision',
          () => 0,
        );
        const id = randomUUID();
        await repos[0]!.save(
          user.id,
          project.id,
          { id, title: 'Unicode', snapshot: artifact },
          500,
        );
        expect(
          (await repos[0]!.get(user.id, project.id, id))?.snapshot,
        ).toEqual(artifact);
        await repos[0]!.delete(user.id, project.id, id);
      }
      const [first, retry] = await Promise.all(
        repos.map((repo) => repo.save(user.id, project.id, input, 500)),
      );
      expect(first).toEqual(retry);
      expect(first).not.toHaveProperty('creatorId');
      expect(first).not.toHaveProperty('contentHash');
      expect(first!.expiresAt.getTime() - first!.createdAt.getTime()).toBe(
        30 * 86_400_000,
      );
      await expect(
        repos[0]!.save(
          user.id,
          project.id,
          { ...input, title: 'Conflict' },
          500,
        ),
      ).rejects.toBeInstanceOf(SaveConflict);
      expect(
        await repos[0]!.get(randomUUID(), project.id, input.id),
      ).toBeNull();
      await repos[0]!.rename(user.id, project.id, input.id, 'Renamed');
      expect(await repos[0]!.get(user.id, project.id, input.id)).toMatchObject({
        title: 'Renamed',
      });
      const attempts = await Promise.allSettled(
        Array.from({ length: 55 }, (_, index) =>
          repos[index % 2]!.save(
            user.id,
            project.id,
            { ...input, id: randomUUID() },
            500,
          ),
        ),
      );
      expect(attempts.filter((row) => row.status === 'fulfilled')).toHaveLength(
        49,
      );
      for (const row of attempts)
        if (row.status === 'rejected')
          expect(row.reason).toBeInstanceOf(SaveLimit);
      const page = await repos[0]!.list(user.id, project.id, { limit: 20 });
      expect(page.items).toHaveLength(20);
      expect(page.nextCursor).not.toBeNull();
      const next = await repos[0]!.list(user.id, project.id, {
        limit: 20,
        after: page.nextCursor!,
      });
      expect(
        new Set([...page.items, ...next.items].map((row) => row.id)).size,
      ).toBe(40);
      await client.playgroundRun.update({
        where: { id: input.id },
        data: { expiresAt: new Date(0) },
      });
      expect(await repos[0]!.get(user.id, project.id, input.id)).toBeNull();
      expect(
        await repos[0]!.rename(user.id, project.id, input.id, 'Expired'),
      ).toBeNull();
      const cleaned = await Promise.all(repos.map((repo) => repo.cleanup()));
      expect(
        cleaned.reduce((sum, value) => sum + value, 0),
      ).toBeGreaterThanOrEqual(1);
      expect(
        await client.playgroundRun.findUnique({ where: { id: input.id } }),
      ).toBeNull();
      expect(
        await repos[0]!.delete(
          user.id,
          project.id,
          page.items.find((row) => row.id !== input.id)!.id,
        ),
      ).toBe(true);
      // Source/reference constraints reject impossible usage combinations.
      await expect(
        client.apiUsage.create({
          data: {
            projectId: project.id,
            apiKeyId: null,
            source: 'api_key',
            endpoint: 'fixture',
            statusCode: 200,
            requestUnits: 1,
            charactersProcessed: 2,
            processingTimeMs: 0,
          },
        }),
      ).rejects.toThrow();
      await client.apiUsage.create({
        data: {
          projectId: project.id,
          apiKeyId: null,
          source: 'playground',
          endpoint: 'playground/normalize',
          statusCode: 200,
          requestUnits: 1,
          charactersProcessed: 2,
          processingTimeMs: 0,
        },
      });
    } finally {
      await client.apiUsage.deleteMany({ where: { projectId: project.id } });
      await client.organization.delete({ where: { id: organization.id } });
      await client.user.delete({ where: { id: user.id } });
      await Promise.all([
        client.$disconnect(),
        ...repos.map((repo) => repo.onApplicationShutdown()),
      ]);
    }
  }, 30_000);
});
