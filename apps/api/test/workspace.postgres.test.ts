import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';
import { createAccountAuth } from '../src/modules/account-auth/create-account-auth.js';
import { parseAccountAuthConfig } from '../src/modules/account-auth/account-auth.config.js';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaWorkspaceRepository } from '../src/infrastructure/database/prisma-workspace.repository.js';
import { PlatformService } from '../src/modules/platform/platform.service.js';

const databaseURL = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseURL)(
  'workspace PostgreSQL transactions and tenant isolation',
  () => {
    it('completes registration, verification, session login, onboarding and project creation over HTTP', async () => {
      vi.stubEnv('AUTH_ENABLED', 'false');
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseURL! }),
      });
      const app = await createApiApplication({
        databaseUrl: databaseURL!,
        logger: false,
      });
      const origin = 'http://localhost:3000';
      const mail: string[] = [];
      const auth = createAccountAuth(
        parseAccountAuthConfig({
          AUTH_ENABLED: 'true',
          DATABASE_URL: databaseURL,
          AUTH_PUBLIC_URL: origin,
          AUTH_SECRET:
            'workspace-http-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
          SMTP_HOST: 'localhost',
          SMTP_FROM: 'test@example.com',
        })!,
        prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
        async (message) => {
          mail.push(message.text);
        },
      );
      Object.defineProperties(app.get(AccountAuthService), {
        auth: { value: auth },
        publicURL: { value: origin },
      });
      const suffix = randomUUID();
      const credentials = {
        name: 'HTTP test',
        email: `workspace-http-${suffix}@example.com`,
        password: 'workspace-http-password-123',
        callbackURL: '/login',
      };
      let organizationId: string | undefined;
      try {
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/auth/sign-up/email',
              headers: { origin },
              payload: credentials,
            })
          ).statusCode,
        ).toBe(200);
        const link = new URL(mail[0]!.match(/https?:\/\/\S+/)![0]);
        expect(
          (
            await app.inject({
              method: 'GET',
              url: `${link.pathname}${link.search}`,
            })
          ).statusCode,
        ).toBe(302);
        const login = await app.inject({
          method: 'POST',
          url: '/api/auth/sign-in/email',
          headers: { origin },
          payload: credentials,
        });
        expect(login.statusCode).toBe(200);
        const cookies = login.headers['set-cookie'];
        const cookie = (Array.isArray(cookies) ? cookies : [cookies!])
          .map((value) => value.split(';')[0])
          .join('; ');
        const headers = { origin, cookie };
        const created = await app.inject({
          method: 'POST',
          url: '/v1/platform/organizations',
          headers,
          payload: { name: 'Team', slug: `http-${suffix}` },
        });
        expect(created.statusCode).toBe(201);
        organizationId = created.json<{ id: string }>().id;
        const project = await app.inject({
          method: 'POST',
          url: `/v1/platform/organizations/${organizationId}/projects`,
          headers,
          payload: { name: 'Live', slug: 'live', environment: 'production' },
        });
        expect(project.statusCode).toBe(201);
        expect(
          (
            await app.inject({
              method: 'GET',
              url: `/v1/platform/organizations/${organizationId}/projects`,
              headers,
            })
          ).json().items,
        ).toHaveLength(1);
        expect(
          (
            await app.inject({
              method: 'POST',
              url: '/api/auth/sign-out',
              headers,
              payload: {},
            })
          ).statusCode,
        ).toBe(200);
        expect(
          (
            await app.inject({
              method: 'GET',
              url: '/v1/platform/organizations',
              headers,
            })
          ).statusCode,
        ).toBe(401);
      } finally {
        if (organizationId) {
          await prisma.organizationMember.deleteMany({
            where: { organizationId },
          });
          await prisma.organization.delete({ where: { id: organizationId } });
        }
        await prisma.user.deleteMany({ where: { email: credentials.email } });
        await app.close();
        await prisma.$disconnect();
        vi.unstubAllEnvs();
      }
    });

    it('atomically onboards, persists projects, applies dynamic grants and isolates tenants', async () => {
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseURL! }),
      });
      const repository = new PrismaWorkspaceRepository(databaseURL!);
      const service = new PlatformService(repository);
      const suffix = randomUUID();
      const organizationIds: string[] = [];
      const user = await prisma.user.create({
        data: {
          email: `workspace-${suffix}@example.com`,
          name: 'Test',
          emailVerified: true,
        },
      });
      try {
        const organization = await service.createOrganization(user.id, {
          name: 'မြန်မာ',
          slug: `workspace-${suffix}`,
        });
        organizationIds.push(organization.id);
        const other = await service.createOrganization(user.id, {
          name: 'Other',
          slug: `other-${suffix}`,
        });
        organizationIds.push(other.id);
        const membership = await prisma.organizationMember.findUniqueOrThrow({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId: user.id,
            },
          },
        });
        expect(
          (await service.getOrganization(user.id, organization.id)).permissions,
        ).toContain('project.create');
        const first = await service.listOrganizations(user.id, { limit: 1 });
        expect(first.items).toHaveLength(1);
        const second = await service.listOrganizations(user.id, {
          limit: 1,
          after: first.nextCursor!,
        });
        expect(second.items).toHaveLength(1);
        expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
        expect(second.nextCursor).toBeNull();

        const project = await service.createProject(user.id, organization.id, {
          name: 'Live',
          slug: 'live',
          environment: 'production',
        });
        await service.createProject(user.id, other.id, {
          name: 'Live',
          slug: 'live',
          environment: 'development',
        });
        await expect(
          service.createProject(user.id, organization.id, {
            name: 'Duplicate',
            slug: 'live',
            environment: 'development',
          }),
        ).rejects.toThrow('slug');
        expect(
          (
            await service.updateProject(user.id, organization.id, project.id, {
              name: 'Renamed',
            })
          ).environment,
        ).toBe('production');
        await expect(
          service.updateProject(user.id, other.id, project.id, {
            name: 'Cross tenant',
          }),
        ).rejects.toThrow('Project not found');
        await expect(
          service.getOrganization(randomUUID(), organization.id),
        ).rejects.toThrow('Organization not found');

        await prisma.role.update({
          where: { id: membership.roleId },
          data: { name: 'Custom maintainer', slug: 'custom-maintainer' },
        });
        expect(
          (await service.listProjects(user.id, organization.id, { limit: 25 }))
            .items,
        ).toHaveLength(1);
        await prisma.rolePermission.deleteMany({
          where: {
            roleId: membership.roleId,
            permission: { key: 'project.update' },
          },
        });
        await expect(
          service.updateProject(user.id, organization.id, project.id, {
            name: 'Denied',
          }),
        ).rejects.toThrow('project.update');

        const rollbackSlug = `rollback-${suffix}`;
        await expect(
          service.createOrganization(randomUUID(), {
            name: 'Invalid member',
            slug: rollbackSlug,
          }),
        ).rejects.toThrow();
        expect(
          await prisma.organization.findUnique({
            where: { slug: rollbackSlug },
          }),
        ).toBeNull();
        await expect(
          service.createOrganization(user.id, {
            name: 'Duplicate',
            slug: organization.slug,
          }),
        ).rejects.toThrow('slug');
        expect(
          await prisma.organizationMember.count({
            where: { organizationId: organization.id },
          }),
        ).toBe(1);
      } finally {
        await prisma.organizationMember.deleteMany({
          where: { organizationId: { in: organizationIds } },
        });
        await prisma.organization.deleteMany({
          where: { id: { in: organizationIds } },
        });
        await prisma.user.delete({ where: { id: user.id } });
        await repository.onApplicationShutdown();
        await prisma.$disconnect();
      }
    });
  },
);
