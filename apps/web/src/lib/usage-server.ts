import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { readPlatform } from './platform-server';
import type {
  Organization,
  OrganizationAccess,
  Page,
  Project,
  UsageReport,
} from './platform-types';

export interface UsageSelection {
  organization?: string;
  project?: string;
  organizationsAfter?: string;
  projectsAfter?: string;
}
export async function loadUsageContext(params: UsageSelection) {
  for (const value of [
    params.organization,
    params.project,
    params.organizationsAfter,
    params.projectsAfter,
  ]) {
    if (value !== undefined && !z.uuid().safeParse(value).success) notFound();
  }
  const organizations = await readPlatform<Page<Organization>>(
    `organizations${params.organizationsAfter ? `?after=${params.organizationsAfter}` : ''}`,
  );
  const organizationId = params.organization ?? organizations.items[0]?.id;
  const organization = organizationId
    ? await readPlatform<OrganizationAccess>(`organizations/${organizationId}`)
    : null;
  const canRead = Boolean(
    organization?.permissions.includes('project.read') &&
    organization.permissions.includes('usage.read'),
  );
  const projects =
    organization && canRead
      ? await readPlatform<Page<Project>>(
          `organizations/${organization.id}/projects${params.projectsAfter ? `?after=${params.projectsAfter}` : ''}`,
        )
      : null;
  const project =
    projects && params.project
      ? (projects.items.find((item) => item.id === params.project) ??
        (await readPlatform<Project>(
          `organizations/${organizationId}/projects/${params.project}`,
        )))
      : projects?.items[0];
  return {
    organization,
    project,
    organizations,
    projects,
    canRead,
    organizationChoices:
      organization &&
      !organizations.items.some((item) => item.id === organization.id)
        ? [organization, ...organizations.items]
        : organizations.items,
    projectChoices:
      project &&
      projects &&
      !projects.items.some((item) => item.id === project.id)
        ? [project, ...projects.items]
        : (projects?.items ?? []),
  };
}
export function readUsageReport(
  organizationId: string,
  projectId: string,
  from?: string,
  to?: string,
) {
  const query = from && to ? `?${new URLSearchParams({ from, to })}` : '';
  return readPlatform<UsageReport>(
    `organizations/${organizationId}/projects/${projectId}/usage${query}`,
  );
}
