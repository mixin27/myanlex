import type { AuthenticatedRequest } from '../../common/auth/authenticated-request.js';

/** The signed-in account performing a platform change. */
export interface AuditActor {
  readonly userId: string;
  readonly email: string;
  readonly requestId?: string;
}

export function auditActor(request: AuthenticatedRequest): AuditActor {
  const principal = request.accountPrincipal!;
  return {
    userId: principal.userId,
    email: principal.email,
    ...(request.id ? { requestId: request.id } : {}),
  };
}

export const auditActions = [
  'organization.created',
  'project.created',
  'project.updated',
  'api_key.created',
  'api_key.revoked',
  'member.role_changed',
  'member.removed',
  'member.left',
  'role.created',
  'role.updated',
  'role.deleted',
  'invitation.created',
  'invitation.resent',
  'invitation.revoked',
  'invitation.accepted',
  'ownership.transferred',
] as const;
export type AuditAction = (typeof auditActions)[number];

export type AuditTargetType =
  'organization' | 'project' | 'api_key' | 'member' | 'role' | 'invitation';

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * What changed. Metadata must never contain secrets: no API-key material,
 * invitation tokens or token hashes.
 */
export interface AuditEntry {
  readonly action: AuditAction;
  readonly targetType: AuditTargetType;
  readonly targetId: string;
  readonly metadata?: { [key: string]: JsonValue };
}

export interface AuditEventSummary {
  id: string;
  action: AuditAction;
  actor: { userId: string | null; email: string };
  target: { type: AuditTargetType; id: string };
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: Date;
}

export interface AuditQuery {
  limit: number;
  cursor?: { createdAt: Date; id: string } | undefined;
  action?: AuditAction | undefined;
}

export const AUDIT_REPOSITORY = Symbol('AUDIT_REPOSITORY');

export interface AuditRepository {
  list(
    organizationId: string,
    query: AuditQuery,
  ): Promise<{ items: AuditEventSummary[]; hasMore: boolean }>;
  /** Deletes up to one batch of events created before `before`. */
  cleanup(before: Date): Promise<number>;
}
