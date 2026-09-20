import type {
  ListQuery,
  OrganizationInput,
  ProjectInput,
  ProjectUpdateInput,
} from './platform.schemas.js';

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
  ): Promise<ApiKeySummary>;
  revokeApiKey(
    organizationId: string,
    projectId: string,
    keyId: string,
    now: Date,
  ): Promise<ApiKeySummary | null>;
  createOrganization(
    userId: string,
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
  ): Promise<ProjectSummary>;
  updateProject(
    organizationId: string,
    projectId: string,
    input: ProjectUpdateInput,
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
