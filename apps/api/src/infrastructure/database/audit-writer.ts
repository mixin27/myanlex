import type { Prisma } from '../../generated/prisma/client.js';
import type { AuditActor, AuditEntry } from '../../modules/platform/audit.js';

/**
 * Records an audit event inside the caller's transaction, so the event exists
 * exactly when the change it describes commits.
 */
export async function recordAudit(
  tx: Prisma.TransactionClient,
  organizationId: string,
  actor: AuditActor,
  entry: AuditEntry,
) {
  await tx.auditEvent.create({
    data: {
      organizationId,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata ?? {},
      requestId: actor.requestId ?? null,
    },
  });
}

/** Sorted set difference, for permission-change metadata. */
export function difference(left: readonly string[], right: readonly string[]) {
  const exclude = new Set(right);
  return [...new Set(left)].filter((key) => !exclude.has(key)).sort();
}
