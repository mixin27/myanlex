import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaWorkspaceRepository } from '../src/infrastructure/database/prisma-workspace.repository.js';
import { PrismaPlatformRepository } from '../src/infrastructure/database/prisma-platform.repository.js';
import { ApiKeysService } from '../src/modules/platform/api-keys.service.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('API-key persistence and revocation', () => {
  it('stores hashes, isolates tenants, authenticates scopes, expires and revokes idempotently', async () => {
    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl!,
        connectionTimeoutMillis: 5000,
      }),
    });
    const repository = new PrismaWorkspaceRepository(databaseUrl!);
    const authentication = new PrismaPlatformRepository(databaseUrl!);
    const service = new ApiKeysService(repository);
    const user = await client.user.create({
      data: {
        email: `keys-${randomUUID()}@example.com`,
        name: 'Keys test',
        emailVerified: true,
      },
    });
    const organizationIds: string[] = [];
    try {
      const organization = await repository.createOrganization(user.id, {
        name: 'Team',
        slug: `keys-${randomUUID()}`,
      });
      organizationIds.push(organization.id);
      const other = await repository.createOrganization(user.id, {
        name: 'Other',
        slug: `keys-${randomUUID()}`,
      });
      organizationIds.push(other.id);
      const project = await repository.createProject(organization.id, {
        name: 'Server',
        slug: 'server',
        environment: 'production',
      });
      const key = await service.create(user.id, organization.id, project.id, {
        name: 'Server key',
        scopes: ['api.invoke'],
      });
      const hash = createHash('sha256').update(key.secret).digest('hex');
      const stored = await client.apiKey.findUniqueOrThrow({
        where: { id: key.id },
      });
      expect(stored.keyHash).toBe(hash);
      expect(JSON.stringify(stored)).not.toContain(key.secret);
      expect(key.prefix).toBe(key.secret.slice(0, 13));
      expect(
        await authentication.authenticateApiKey(hash, new Date()),
      ).toMatchObject({
        apiKeyId: key.id,
        projectId: project.id,
        permissionKeys: ['api.invoke'],
        persisted: true,
      });
      const listed = await service.list(user.id, organization.id, project.id, {
        limit: 25,
      });
      expect(listed.items[0]?.lastUsedAt).toBeInstanceOf(Date);
      expect(JSON.stringify(listed)).not.toContain(hash);
      expect(JSON.stringify(listed)).not.toContain(key.secret);
      await expect(
        service.create(user.id, other.id, project.id, {
          name: 'Denied',
          scopes: ['api.invoke'],
        }),
      ).rejects.toThrow('Project not found');
      expect(
        await repository.revokeApiKey(other.id, project.id, key.id, new Date()),
      ).toBeNull();
      expect(
        (await repository.listApiKeys(other.id, project.id, { limit: 25 }))
          .items,
      ).toEqual([]);
      await expect(
        repository.createApiKey(other.id, project.id, {
          name: 'Denied',
          prefix: 'test',
          keyHash: 'f'.repeat(64),
          scopes: ['api.invoke'],
          expiresAt: null,
        }),
      ).rejects.toThrow();
      const expiring = await service.create(
        user.id,
        organization.id,
        project.id,
        {
          name: 'Expires',
          scopes: ['api.invoke'],
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
      );
      expect(
        await authentication.authenticateApiKey(
          createHash('sha256').update(expiring.secret).digest('hex'),
          new Date(Date.now() + 120000),
        ),
      ).toBeUndefined();
      const revoked = await Promise.all([
        service.revoke(user.id, organization.id, project.id, key.id),
        service.revoke(user.id, organization.id, project.id, key.id),
      ]);
      expect(revoked[0]?.revokedAt).toEqual(revoked[1]?.revokedAt);
      expect(
        await authentication.authenticateApiKey(hash, new Date()),
      ).toBeUndefined();
      expect(await client.apiKey.count({ where: { id: key.id } })).toBe(1);
      const first = await service.list(user.id, organization.id, project.id, {
        limit: 1,
      });
      const second = await service.list(user.id, organization.id, project.id, {
        limit: 1,
        after: first.nextCursor!,
      });
      expect(first.items[0]?.id).not.toBe(second.items[0]?.id);
      expect(second.nextCursor).toBeNull();
    } finally {
      await client.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await client.user.delete({ where: { id: user.id } });
      await Promise.all([
        client.$disconnect(),
        repository.onApplicationShutdown(),
        authentication.onApplicationShutdown(),
      ]);
    }
  });
});
