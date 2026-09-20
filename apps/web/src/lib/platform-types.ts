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
