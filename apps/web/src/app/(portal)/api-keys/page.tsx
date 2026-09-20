import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { readPlatform } from '@/lib/platform-server';
import type {
  ApiKey,
  Organization,
  OrganizationAccess,
  Page,
  Project,
} from '@/lib/platform-types';
import { OrganizationPicker } from '@/components/workspace/organization-picker';
import { ProjectPicker } from '@/components/workspace/project-picker';
import { ApiKeyManager } from '@/components/workspace/api-key-manager';
import { buttonVariants } from '@/components/ui/button';

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{
    organization?: string;
    project?: string;
    after?: string;
    organizationsAfter?: string;
    projectsAfter?: string;
  }>;
}) {
  const params = await searchParams;
  for (const value of Object.values(params))
    if (value !== undefined && !z.uuid().safeParse(value).success) notFound();
  const organizations = await readPlatform<Page<Organization>>(
    `organizations${params.organizationsAfter ? `?after=${params.organizationsAfter}` : ''}`,
  );
  const organizationId = params.organization ?? organizations.items[0]?.id;
  const organization = organizationId
    ? await readPlatform<OrganizationAccess>(`organizations/${organizationId}`)
    : null;
  const choices =
    organization &&
    !organizations.items.some((item) => item.id === organization.id)
      ? [organization, ...organizations.items]
      : organizations.items;
  const projects = organization?.permissions.includes('project.read')
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
  const projectChoices =
    project &&
    projects &&
    !projects.items.some((item) => item.id === project.id)
      ? [project, ...projects.items]
      : (projects?.items ?? []);
  const projectId = project?.id;
  const keys =
    organization &&
    projectId &&
    organization.permissions.includes('api_key.read')
      ? await readPlatform<Page<ApiKey>>(
          `organizations/${organization.id}/projects/${projectId}/api-keys${params.after ? `?after=${params.after}` : ''}`,
        )
      : null;
  const context = `organization=${organizationId}&project=${projectId}`;
  return (
    <div className="space-y-6">
      <header className="page-heading">
        <h1>API keys</h1>
        <p>Secure, scoped access for every application you build.</p>
      </header>
      <div className="flex flex-wrap gap-3">
        {choices.length > 0 && (
          <OrganizationPicker
            organizations={choices}
            selected={organizationId}
          />
        )}
        {organization && projects && projectId && (
          <ProjectPicker
            organizationId={organization.id}
            projects={projectChoices}
            selected={projectId}
          />
        )}
      </div>
      <nav
        aria-label="Workspace and project pages"
        className="flex flex-wrap gap-4 text-xs underline"
      >
        {organizations.nextCursor && (
          <Link
            href={`/api-keys?organizationsAfter=${organizations.nextCursor}`}
          >
            More workspaces
          </Link>
        )}
        {params.organizationsAfter && (
          <Link href="/api-keys">First workspaces</Link>
        )}
        {projects?.nextCursor && (
          <Link
            href={`/api-keys?organization=${organizationId}&projectsAfter=${projects.nextCursor}`}
          >
            More projects
          </Link>
        )}
        {params.projectsAfter && (
          <Link href={`/api-keys?organization=${organizationId}`}>
            First projects
          </Link>
        )}
      </nav>
      {organization && projectId && keys ? (
        <ApiKeyManager
          key={`${organization.id}-${projectId}`}
          organizationId={organization.id}
          projectId={projectId}
          keys={keys.items}
          permissions={organization.permissions}
        />
      ) : (
        <section className="rounded-xl border bg-white p-8">
          <h2 className="font-semibold">
            {!organization
              ? 'Start with a workspace'
              : !organization.permissions.includes('project.read') ||
                  !organization.permissions.includes('api_key.read')
                ? 'Access restricted'
                : 'Create your first project'}
          </h2>
          <p className="my-3 text-sm text-muted-foreground">
            {!organization
              ? 'Create a workspace and project before issuing a key.'
              : !organization.permissions.includes('project.read') ||
                  !organization.permissions.includes('api_key.read')
                ? 'Your role needs project.read and api_key.read to use this key-management screen.'
                : 'API keys belong to projects. Add a project to get started.'}
          </p>
          <Link
            className={buttonVariants({ variant: 'outline' })}
            href={
              organization
                ? `/projects?organization=${organization.id}`
                : '/projects'
            }
          >
            Open projects
          </Link>
        </section>
      )}
      <nav aria-label="API key pages" className="flex gap-4 text-sm underline">
        {params.after && <Link href={`/api-keys?${context}`}>First keys</Link>}
        {keys?.nextCursor && (
          <Link href={`/api-keys?${context}&after=${keys.nextCursor}`}>
            Next keys
          </Link>
        )}
      </nav>
    </div>
  );
}
