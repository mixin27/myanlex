export interface Organization {
  id: string;
  name: string;
  slug: string;
}
export interface OrganizationAccess extends Organization {
  permissions: string[];
}
export interface Project extends Organization {
  organizationId: string;
  environment: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ApiKey {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}
export interface UsageMetrics {
  requestCount: string;
  errorCount: string;
  charactersProcessed: string;
  processingTimeMs: string;
  averageProcessingTimeMs: string | null;
}
export interface UsageReport {
  sources?: { api_key: UsageMetrics; playground: UsageMetrics };
  projectId: string;
  from: string;
  to: string;
  timezone: 'UTC';
  generatedAt: string;
  metering: 'best-effort';
  totals: UsageMetrics;
  days: (UsageMetrics & { date: string })[];
}

export interface QuotaDimension {
  used: string;
  limit: string | null;
  remaining: string | null;
}
export interface QuotaReport {
  organizationId: string;
  enforcementEnabled: boolean;
  timezone: 'UTC';
  generatedAt: string;
  periodStart: string;
  resetsAt: string;
  metering: 'admission-reservations';
  plan: { name: string; slug: string; source: 'subscription' | 'free' };
  requests: QuotaDimension;
  characters: QuotaDimension;
}

export interface UsageStatementLine {
  projectId: string;
  projectName: string;
  source: 'api_key' | 'playground';
  apiKey: { id: string; name: string | null; prefix: string | null } | null;
  requests: string;
  characters: string;
}
/** Billable monthly totals from the usage ledger (admitted requests). */
export interface UsageStatement {
  organizationId: string;
  month: string;
  timezone: 'UTC';
  periodStart: string;
  periodEnd: string;
  status: 'open' | 'closed';
  billableUnit: 'admitted-request';
  generatedAt: string;
  closedAt: string | null;
  totals: { requests: string; characters: string; events: string };
  counter: { requests: string; characters: string };
  reconciled: boolean;
  plan: {
    name: string;
    slug: string;
    monthlyRequestLimit: string | null;
    monthlyCharacterLimit: string | null;
  };
  lines: UsageStatementLine[];
  ledgerAvailable: boolean;
}

export interface RoleReference {
  id: string;
  name: string;
  slug: string;
}
export interface Role extends RoleReference {
  description: string | null;
  system: boolean;
  permissions: string[];
  memberCount: number;
  invitationCount: number;
}
export interface Permission {
  key: string;
  description: string;
}
export interface Member {
  userId: string;
  name: string;
  email: string;
  role: RoleReference;
  permissions: string[];
  joinedAt: string;
}
export interface Invitation {
  id: string;
  email: string;
  role: RoleReference;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
  createdAt: string;
}
export interface SentInvitation extends Invitation {
  emailDelivery: 'sent' | 'failed' | 'disabled';
}
export interface PendingInvitation {
  id: string;
  organization: Organization;
  role: RoleReference;
  expiresAt: string;
  createdAt: string;
}
export interface AcceptedInvitation {
  status: 'accepted' | 'already_member';
  organization: Organization;
}
export type AuditAction =
  | 'organization.created'
  | 'project.created'
  | 'project.updated'
  | 'api_key.created'
  | 'api_key.revoked'
  | 'member.role_changed'
  | 'member.removed'
  | 'member.left'
  | 'role.created'
  | 'role.updated'
  | 'role.deleted'
  | 'invitation.created'
  | 'invitation.resent'
  | 'invitation.revoked'
  | 'invitation.accepted'
  | 'ownership.transferred';
export interface AuditEvent {
  id: string;
  action: AuditAction;
  actor: { userId: string | null; email: string };
  target: { type: string; id: string };
  metadata: Record<string, unknown>;
  requestId: string | null;
  createdAt: string;
}
export interface AuditEventPage {
  items: AuditEvent[];
  nextCursor: string | null;
}
export interface OwnershipTransfer {
  owner: Member;
  previousOwner: Member;
}
