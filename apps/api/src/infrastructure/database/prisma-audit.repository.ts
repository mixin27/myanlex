import { PrismaPg } from '@prisma/adapter-pg';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import type {
  AuditAction,
  AuditEventSummary,
  AuditQuery,
  AuditRepository,
  AuditTargetType,
} from '../../modules/platform/audit.js';

const cleanupBatch = 500;

export class PrismaAuditRepository
  implements AuditRepository, OnApplicationShutdown
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

  async onApplicationShutdown() {
    await this.client.$disconnect();
  }

  async list(organizationId: string, query: AuditQuery) {
    const { cursor } = query;
    // Newest first; (created_at, id) keyset matches the composite index.
    const rows = await this.client.auditEvent.findMany({
      where: {
        organizationId,
        ...(query.action ? { action: query.action } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const items: AuditEventSummary[] = rows
      .slice(0, query.limit)
      .map((row) => ({
        id: row.id,
        action: row.action as AuditAction,
        actor: { userId: row.actorUserId, email: row.actorEmail },
        target: { type: row.targetType as AuditTargetType, id: row.targetId },
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {},
        requestId: row.requestId,
        createdAt: row.createdAt,
      }));
    return { items, hasMore: rows.length > query.limit };
  }

  cleanup(before: Date) {
    return this.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM audit_events WHERE created_at < ${before.toISOString()}::timestamptz
        ORDER BY created_at LIMIT ${cleanupBatch} FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return 0;
      return (
        await tx.auditEvent.deleteMany({
          where: { id: { in: rows.map((row) => row.id) } },
        })
      ).count;
    });
  }
}
