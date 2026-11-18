import { PrismaPg } from '@prisma/adapter-pg';
import type { UsageDayRecord } from '../../modules/platform/usage-report.schemas.js';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { permissionCatalog } from '../../modules/platform/permission-catalog.js';
import type {
  ListQuery,
  OrganizationInput,
  ProjectInput,
  ProjectUpdateInput,
} from '../../modules/platform/platform.schemas.js';
import type { AuditActor } from '../../modules/platform/audit.js';
import { recordAudit } from './audit-writer.js';
import { WorkspaceConflict } from '../../modules/platform/workspace.repository.js';
import type {
  WorkspaceRepository,
  Page,
  ApiKeyRecord,
} from '../../modules/platform/workspace.repository.js';

// Explicit projection: neither hashes nor plaintext can escape read methods.
const keySelect = {
  id: true,
  projectId: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  scopes: { select: { permission: { select: { key: true } } } },
} as const;
function summarizeKey(
  key: Prisma.ApiKeyGetPayload<{ select: typeof keySelect }>,
) {
  return {
    ...key,
    scopes: key.scopes.map((scope) => scope.permission.key).sort(),
  };
}

const organizationSelect = { id: true, name: true, slug: true } as const;
const projectSelect = {
  ...organizationSelect,
  organizationId: true,
  environment: true,
} as const;

function page<T extends { id: string }>(items: T[], limit: number): Page<T> {
  const hasMore = items.length > limit;
  const selected = items.slice(0, limit);
  return { items: selected, nextCursor: hasMore ? selected.at(-1)!.id : null };
}

async function uniqueWrite<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    ) {
      throw new WorkspaceConflict('This slug is already in use.');
    }
    throw error;
  }
}

export class PrismaWorkspaceRepository
  implements WorkspaceRepository, OnApplicationShutdown
{
  private readonly client: PrismaClient;
  constructor(databaseUrl: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
      }),
    });
  }

  createOrganization(actor: AuditActor, input: OrganizationInput) {
    const { userId } = actor;
    return uniqueWrite(() =>
      this.client.$transaction(async (tx: Prisma.TransactionClient) => {
        const organization = await tx.organization.create({
          data: input,
          select: organizationSelect,
        });
        const role = await tx.role.create({
          data: {
            organizationId: organization.id,
            name: 'Owner',
            slug: 'owner',
            system: true,
          },
        });
        // Grant an explicit catalog snapshot; never grant arbitrary future rows.
        await tx.permission.createMany({
          data: permissionCatalog.map(([key, description]) => ({
            key,
            description,
          })),
          skipDuplicates: true,
        });
        const permissions = await tx.permission.findMany({
          where: { key: { in: permissionCatalog.map(([key]) => key) } },
          select: { id: true },
        });
        await tx.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
          })),
        });
        await tx.organizationMember.create({
          data: { organizationId: organization.id, userId, roleId: role.id },
        });
        await recordAudit(tx, organization.id, actor, {
          action: 'organization.created',
          targetType: 'organization',
          targetId: organization.id,
          metadata: { name: organization.name, slug: organization.slug },
        });
        return organization;
      }),
    );
  }

  async listOrganizations(userId: string, query: ListQuery) {
    const items = await this.client.organization.findMany({
      where: {
        members: { some: { userId } },
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      select: organizationSelect,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    return page(items, query.limit);
  }

  async getOrganization(userId: string, organizationId: string) {
    const member = await this.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: {
        organization: { select: organizationSelect },
        role: {
          select: {
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
    return member
      ? {
          ...member.organization,
          permissions: member.role.permissions
            .map((grant) => grant.permission.key)
            .sort(),
        }
      : null;
  }

  async listProjects(organizationId: string, query: ListQuery) {
    return page(
      await this.client.project.findMany({
        where: {
          organizationId,
          ...(query.after ? { id: { gt: query.after } } : {}),
        },
        select: projectSelect,
        orderBy: { id: 'asc' },
        take: query.limit + 1,
      }),
      query.limit,
    );
  }

  createProject(
    organizationId: string,
    input: ProjectInput,
    actor: AuditActor,
  ) {
    return uniqueWrite(() =>
      this.client.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: { ...input, organizationId },
          select: projectSelect,
        });
        await recordAudit(tx, organizationId, actor, {
          action: 'project.created',
          targetType: 'project',
          targetId: project.id,
          metadata: {
            name: project.name,
            slug: project.slug,
            environment: project.environment,
          },
        });
        return project;
      }),
    );
  }

  updateProject(
    organizationId: string,
    projectId: string,
    input: ProjectUpdateInput,
    actor: AuditActor,
  ) {
    return uniqueWrite(() =>
      this.client.$transaction(async (tx) => {
        const before = await tx.project.findFirst({
          where: { id: projectId, organizationId },
          select: projectSelect,
        });
        if (!before) return null;
        // The tenant boundary is part of the write, not only a preceding lookup.
        const [project] = await tx.project.updateManyAndReturn({
          where: { id: projectId, organizationId },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.slug !== undefined ? { slug: input.slug } : {}),
            ...(input.environment !== undefined
              ? { environment: input.environment }
              : {}),
          },
          select: projectSelect,
        });
        if (!project) return null;
        const changes: Record<string, [string, string]> = {};
        for (const field of ['name', 'slug', 'environment'] as const)
          if (before[field] !== project[field])
            changes[field] = [before[field], project[field]];
        if (Object.keys(changes).length > 0)
          await recordAudit(tx, organizationId, actor, {
            action: 'project.updated',
            targetType: 'project',
            targetId: projectId,
            metadata: { name: project.name, changes },
          });
        return project;
      }),
    );
  }

  async onApplicationShutdown() {
    await this.client.$disconnect();
  }

  findProject(organizationId: string, projectId: string) {
    return this.client.project.findFirst({
      where: { id: projectId, organizationId },
      select: projectSelect,
    });
  }

  readUsageDays(
    organizationId: string,
    projectId: string,
    start: Date,
    end: Date,
  ) {
    // Tagged-template values are bound parameters. Aggregate in one snapshot;
    // keep the timestamp predicate indexable and UTC bucketing explicit.
    return this.client.$queryRaw<UsageDayRecord[]>`
      SELECT to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, u.source AS source,
        count(*)::bigint AS "requestCount",
        count(*) FILTER (WHERE u.status_code >= 400)::bigint AS "errorCount",
        coalesce(sum(u.characters_processed), 0)::bigint AS "charactersProcessed",
        coalesce(sum(u.processing_time_ms), 0)::bigint AS "processingTimeMs"
      FROM api_usage u JOIN projects p ON p.id = u.project_id
      WHERE p.organization_id = ${organizationId}::uuid AND u.project_id = ${projectId}::uuid
        AND u.created_at >= ${start.toISOString()}::timestamptz
        AND u.created_at < ${end.toISOString()}::timestamptz
      GROUP BY 1, u.source ORDER BY 1, u.source
    `;
  }

  async listApiKeys(
    organizationId: string,
    projectId: string,
    query: ListQuery,
  ) {
    const keys = await this.client.apiKey.findMany({
      where: {
        projectId,
        project: { organizationId },
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      select: keySelect,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    return page(keys.map(summarizeKey), query.limit);
  }

  async createApiKey(
    organizationId: string,
    projectId: string,
    input: ApiKeyRecord,
    actor: AuditActor,
  ) {
    const { scopes, ...data } = input;
    return this.client.$transaction(async (tx) => {
      const key = summarizeKey(
        await tx.apiKey.create({
          data: {
            ...data,
            project: { connect: { id: projectId, organizationId } },
            scopes: {
              create: scopes.map((key) => ({
                permission: { connect: { key } },
              })),
            },
          },
          select: keySelect,
        }),
      );
      // Identify keys by name and prefix only; never record key material.
      await recordAudit(tx, organizationId, actor, {
        action: 'api_key.created',
        targetType: 'api_key',
        targetId: key.id,
        metadata: {
          name: key.name,
          prefix: key.prefix,
          projectId,
          scopes: key.scopes,
          expiresAt: key.expiresAt?.toISOString() ?? null,
        },
      });
      return key;
    });
  }

  async revokeApiKey(
    organizationId: string,
    projectId: string,
    keyId: string,
    now: Date,
    actor: AuditActor,
  ) {
    const where = { id: keyId, projectId, project: { organizationId } };
    return this.client.$transaction(async (tx) => {
      const { count } = await tx.apiKey.updateMany({
        where: { ...where, revokedAt: null },
        data: { revokedAt: now },
      });
      const key = await tx.apiKey.findFirst({ where, select: keySelect });
      // Revoking an already revoked key is idempotent and not recorded.
      if (key && count === 1)
        await recordAudit(tx, organizationId, actor, {
          action: 'api_key.revoked',
          targetType: 'api_key',
          targetId: keyId,
          metadata: { name: key.name, prefix: key.prefix, projectId },
        });
      return key ? summarizeKey(key) : null;
    });
  }
}
