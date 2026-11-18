import type { UsageDayRecord } from './usage-report.schemas.js';
import type {
  ListQuery,
  OrganizationInput,
  ProjectInput,
  ProjectUpdateInput,
} from './platform.schemas.js';
import type { AuditActor } from './audit.js';

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');
export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}
export interface OrganizationAccess extends OrganizationSummary {
  permissions: string[];
}
export interface ProjectSummary extends OrganizationSummary {
  organizationId: string;
  environment: string;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface WorkspaceRepository {
  readUsageDays(
    organizationId: string,
    projectId: string,
    start: Date,
    end: Date,
  ): Promise<UsageDayRecord[]>;
  findProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectSummary | null>;
  listApiKeys(
    organizationId: string,
    projectId: string,
    query: ListQuery,
  ): Promise<Page<ApiKeySummary>>;
  createApiKey(
    organizationId: string,
    projectId: string,
    input: ApiKeyRecord,
    actor: AuditActor,
  ): Promise<ApiKeySummary>;
  revokeApiKey(
    organizationId: string,
    projectId: string,
    keyId: string,
    now: Date,
    actor: AuditActor,
  ): Promise<ApiKeySummary | null>;
  /** Creates the organization with the actor as its Owner. */
  createOrganization(
    actor: AuditActor,
    input: OrganizationInput,
  ): Promise<OrganizationSummary>;
  listOrganizations(
    userId: string,
    query: ListQuery,
  ): Promise<Page<OrganizationSummary>>;
  getOrganization(
    userId: string,
    organizationId: string,
  ): Promise<OrganizationAccess | null>;
  listProjects(
    organizationId: string,
    query: ListQuery,
  ): Promise<Page<ProjectSummary>>;
  createProject(
    organizationId: string,
    input: ProjectInput,
    actor: AuditActor,
  ): Promise<ProjectSummary>;
  updateProject(
    organizationId: string,
    projectId: string,
    input: ProjectUpdateInput,
    actor: AuditActor,
  ): Promise<ProjectSummary | null>;
}

export class WorkspaceConflict extends Error {}

export interface ApiKeySummary {
  id: string;
  projectId: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}
export interface ApiKeyRecord {
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  expiresAt: Date | null;
}
