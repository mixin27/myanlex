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
