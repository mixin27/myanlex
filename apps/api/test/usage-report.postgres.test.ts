import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';
import { ApiKeysService } from '../src/modules/platform/api-keys.service.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaWorkspaceRepository } from '../src/infrastructure/database/prisma-workspace.repository.js';
import { UsageReportService } from '../src/modules/platform/usage-report.service.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('PostgreSQL usage aggregation', () => {
  it('reports real authenticated single and batch requests without storing their text', async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl!,
        connectionTimeoutMillis: 5000,
      }),
    });
    const repository = new PrismaWorkspaceRepository(databaseUrl!);
    const app = await createApiApplication({
      databaseUrl: databaseUrl!,
      apiKey: 'usage-bootstrap-test',
      logger: false,
      rateLimitMaxRequests: 1000,
    });
    const user = await client.user.create({
      data: {
        name: 'Metering test',
        email: `metering-${randomUUID()}@example.com`,
        emailVerified: true,
      },
    });
    let organizationId: string | undefined;
    try {
      const organization = await repository.createOrganization(user.id, {
        name: 'HTTP report',
        slug: `metering-${randomUUID()}`,
      });
      organizationId = organization.id;
      const project = await repository.createProject(organization.id, {
        name: 'API',
        slug: 'api',
        environment: 'development',
      });
      const key = await new ApiKeysService(repository).create(
        user.id,
        organization.id,
        project.id,
        { name: 'HTTP test', scopes: ['api.invoke'] },
      );
      Object.defineProperty(app.get(AccountAuthService), 'auth', {
        value: {
          api: {
            getSession: async () => ({
              user: { id: user.id, emailVerified: true },
            }),
          },
        },
      });
      const headers = { authorization: `Bearer ${key.secret}` };
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/text/normalize',
            headers,
            payload: { text: 'က😀' },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/text/normalize',
            headers,
            payload: { text: 12 },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/batch/syllabify',
            headers,
            payload: {
              items: [
                { id: 'a', text: 'က' },
                { id: 'b', text: '😀' },
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
            payload: { text: 'Not counted' },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/v1/text/normalize',
            headers: { authorization: 'Bearer usage-bootstrap-test' },
            payload: { text: 'Not counted' },
          })
        ).statusCode,
      ).toBe(200);
      await expect
        .poll(
          () => client.apiUsage.count({ where: { projectId: project.id } }),
          { timeout: 5000 },
        )
        .toBe(3);
      const result = await app.inject({
        method: 'GET',
        url: `/v1/platform/organizations/${organization.id}/projects/${project.id}/usage`,
        headers: { cookie: 'test-session' },
      });
      expect(result.statusCode).toBe(200);
      expect(result.json().totals).toMatchObject({
        requestCount: '3',
        errorCount: '1',
        charactersProcessed: '4',
      });
      expect(result.headers['cache-control']).toBe('private, no-store');
      const records = await client.apiUsage.findMany({
        where: { projectId: project.id },
      });
      const stored = JSON.stringify(records, (_key, value: unknown) =>
        typeof value === 'bigint' ? value.toString() : value,
      );
      expect(stored).not.toContain('က');
      expect(stored).not.toContain('😀');
      expect(stored).not.toContain(key.secret);
    } finally {
      await app.close();
      if (organizationId) {
        await client.apiUsage.deleteMany({
          where: { project: { organizationId } },
        });
        await client.organization.delete({ where: { id: organizationId } });
      }
      await client.user.delete({ where: { id: user.id } });
      await Promise.all([
        client.$disconnect(),
        repository.onApplicationShutdown(),
      ]);
      vi.unstubAllEnvs();
    }
  });
  it('uses exact UTC boundaries, tenant isolation and repeatable read-only aggregation', async () => {
    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl!,
        connectionTimeoutMillis: 5000,
      }),
    });
    const nonUtcUrl = new URL(databaseUrl!);
    nonUtcUrl.searchParams.set('options', '-c TimeZone=Pacific/Honolulu');
    const repository = new PrismaWorkspaceRepository(nonUtcUrl.toString());
    const service = new UsageReportService(repository);
    const user = await client.user.create({
      data: {
        name: 'Usage test',
        email: `usage-${randomUUID()}@example.com`,
        emailVerified: true,
      },
    });
    const organizations: string[] = [];
    try {
      const organization = await repository.createOrganization(user.id, {
        name: 'Reports',
        slug: `usage-${randomUUID()}`,
      });
      organizations.push(organization.id);
      const other = await repository.createOrganization(user.id, {
        name: 'Other',
        slug: `usage-${randomUUID()}`,
      });
      organizations.push(other.id);
      const project = await repository.createProject(organization.id, {
        name: 'API',
        slug: 'api',
        environment: 'development',
      });
      const sibling = await repository.createProject(organization.id, {
        name: 'Sibling',
        slug: 'sibling',
        environment: 'development',
      });
      const foreign = await repository.createProject(other.id, {
        name: 'Foreign',
        slug: 'foreign',
        environment: 'production',
      });
      const keys = await Promise.all(
        [project, sibling, foreign].map((item) =>
          client.apiKey.create({
            data: {
              projectId: item.id,
              name: 'Fixture',
              prefix: 'fixture',
              keyHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
            },
          }),
        ),
      );
      const record = (
        projectId: string,
        apiKeyId: string,
        createdAt: string,
        statusCode = 200,
        charactersProcessed = 7,
        processingTimeMs = 10,
      ) => ({
        projectId,
        apiKeyId,
        createdAt: new Date(createdAt),
        endpoint: '/v1/text/normalize',
        statusCode,
        charactersProcessed,
        processingTimeMs,
        requestUnits: 1,
      });
      await client.apiUsage.createMany({
        data: [
          record(project.id, keys[0]!.id, '2026-01-01T23:59:59.999Z', 500, 999),
          record(
            project.id,
            keys[0]!.id,
            '2026-01-02T00:00:00Z',
            200,
            2147483647,
            10,
          ),
          record(
            project.id,
            keys[0]!.id,
            '2026-01-02T17:30:00Z',
            400,
            2147483647,
            20,
          ),
          record(
            project.id,
            keys[0]!.id,
            '2026-01-04T23:59:59.999Z',
            500,
            6,
            60,
          ),
          record(project.id, keys[0]!.id, '2026-01-05T00:00:00Z', 200, 999),
          record(sibling.id, keys[1]!.id, '2026-01-02T00:00:00Z', 200, 999),
          record(foreign.id, keys[2]!.id, '2026-01-02T00:00:00Z', 200, 999),
        ],
      });
      // Revoked credentials retain their historical usage.
      await client.apiKey.update({
        where: { id: keys[0]!.id },
        data: { revokedAt: new Date() },
      });
      const input = { from: '2026-01-02', to: '2026-01-04' };
      const first = await service.report(
        user.id,
        organization.id,
        project.id,
        input,
      );
      expect(first.totals).toEqual({
        requestCount: '3',
        errorCount: '2',
        charactersProcessed: '4294967300',
        processingTimeMs: '90',
        averageProcessingTimeMs: '30.00',
      });
      expect(first.days.map((day) => day.requestCount)).toEqual([
        '2',
        '0',
        '1',
      ]);
      expect(
        (await service.report(user.id, organization.id, project.id, input))
          .totals,
      ).toEqual(first.totals);
      expect(JSON.stringify(first)).not.toContain(keys[0]!.keyHash);
      expect(
        await repository.readUsageDays(
          other.id,
          project.id,
          new Date('2026-01-02T00:00:00Z'),
          new Date('2026-01-05T00:00:00Z'),
        ),
      ).toEqual([]);
      await expect(
        service.report(user.id, other.id, project.id, input),
      ).rejects.toThrow('Project not found');
      await expect(
        service.report(randomUUID(), organization.id, project.id, input),
      ).rejects.toThrow('Organization not found');
      const member = await client.organizationMember.findUniqueOrThrow({
        where: {
          organizationId_userId: {
            organizationId: organization.id,
            userId: user.id,
          },
        },
      });
      await client.rolePermission.deleteMany({
        where: { roleId: member.roleId, permission: { key: 'usage.read' } },
      });
      await expect(
        service.report(user.id, organization.id, project.id, input),
      ).rejects.toThrow('usage.read');
    } finally {
      await client.apiUsage.deleteMany({
        where: { project: { organizationId: { in: organizations } } },
      });
      await client.organization.deleteMany({
        where: { id: { in: organizations } },
      });
      await client.user.delete({ where: { id: user.id } });
      await Promise.all([
        client.$disconnect(),
        repository.onApplicationShutdown(),
      ]);
    }
  });
});
