import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { readPlatform } from '@/lib/platform-server';
import type {
  Organization,
  OrganizationAccess,
  Page,
  Project,
} from '@/lib/platform-types';
import { OrganizationPicker } from './organization-picker';
import { ProjectTable } from './project-table';
import { ResourceForm } from './resource-form';
import { CreateResource } from './create-resource';

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{
    organization?: string;
    after?: string;
    organizationsAfter?: string;
  }>;
}) {
  const params = await searchParams;
  for (const value of [
    params.organization,
    params.after,
    params.organizationsAfter,
  ]) {
    if (value !== undefined && !z.uuid().safeParse(value).success) notFound();
  }
  const organizations = await readPlatform<Page<Organization>>(
    `organizations${params.organizationsAfter ? `?after=${params.organizationsAfter}` : ''}`,
  );
  const selectedId = params.organization ?? organizations.items[0]?.id;
  const selected = selectedId
    ? await readPlatform<OrganizationAccess>(`organizations/${selectedId}`)
    : null;
  const choices =
    selected && !organizations.items.some((org) => org.id === selected.id)
      ? [selected, ...organizations.items]
      : organizations.items;
  const canRead = selected?.permissions.includes('project.read');
  const projects =
    selected && canRead
      ? await readPlatform<Page<Project>>(
          `organizations/${selected.id}/projects${params.after ? `?after=${params.after}` : ''}`,
        )
      : null;

  return (
    <div className="space-y-6">
      <header className="page-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Projects</h1>
          <p>
            {selected
              ? `Manage projects in ${selected.name}.`
              : 'Welcome! Create an organization to start your workspace.'}
          </p>
        </div>
        {selected?.permissions.includes('project.create') && (
          <CreateResource organizationId={selected.id} />
        )}
      </header>
      {choices.length > 0 && (
        <OrganizationPicker organizations={choices} selected={selected?.id} />
      )}
      <nav
        className="flex gap-4 text-sm underline"
        aria-label="Organization pages"
      >
        {params.organizationsAfter && (
          <Link href="/projects">First organizations</Link>
        )}
        {organizations.nextCursor && (
          <Link
            href={`/projects?organizationsAfter=${organizations.nextCursor}`}
          >
            More organizations
          </Link>
        )}
      </nav>
      {selected && !canRead && (
        <p role="status">
          Your role does not grant permission to view projects in this
          organization.
        </p>
      )}
      {projects && (
        <ProjectTable
          key={`projects-${selectedId}`}
          projects={projects.items}
          canUpdate={selected!.permissions.includes('project.update')}
        />
      )}
      <nav className="flex gap-4 text-sm underline" aria-label="Project pages">
        {params.after && (
          <Link href={`/projects?organization=${selectedId}`}>
            First projects
          </Link>
        )}
        {projects?.nextCursor && (
          <Link
            href={`/projects?organization=${selectedId}&after=${projects.nextCursor}`}
          >
            Next projects
          </Link>
        )}
      </nav>
      {selected ? <CreateResource /> : <ResourceForm />}
      <p className="text-sm text-muted-foreground">
        Select a project to manage its API keys. Each project has isolated
        credentials.
      </p>
    </div>
  );
}
