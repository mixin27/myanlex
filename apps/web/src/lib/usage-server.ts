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
  UsageStatement,
} from './platform-types';

export interface UsageSelection {
  organization?: string;
  project?: string;
  organizationsAfter?: string;
  projectsAfter?: string;
  month?: string;
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
  if (params.month !== undefined && !isStatementMonth(params.month)) notFound();
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

export const isStatementMonth = (value: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** Billable statement for a workspace month; needs only usage.read. */
export function readUsageStatement(organizationId: string, month?: string) {
  return readPlatform<UsageStatement>(
    `organizations/${organizationId}/usage-statements${month ? `?month=${month}` : ''}`,
  );
}

/** The current month followed by the previous `count - 1` months, newest first. */
export function recentMonths(current: string, count = 13): string[] {
  const [year, month] = current.split('-').map(Number) as [number, number];
  return Array.from({ length: count }, (_, index) =>
    new Date(Date.UTC(year, month - 1 - index, 1)).toISOString().slice(0, 7),
  );
}
