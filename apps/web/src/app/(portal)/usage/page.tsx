import Link from 'next/link';
import {
  loadUsageContext,
  readUsageReport,
  type UsageSelection,
} from '@/lib/usage-server';
import { validateUsageDates } from '@/lib/usage-range';
import { OrganizationPicker } from '@/components/workspace/organization-picker';
import { ProjectPicker } from '@/components/workspace/project-picker';
import { UsageMetrics } from '@/components/usage/usage-metrics';
import { UsageFilters } from '@/components/usage/usage-filters';
import { UsageChart } from '@/components/usage/usage-chart';
import { UsageDetails } from '@/components/usage/usage-details';
import { UsageNotice } from '@/components/usage/usage-notice';

export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<UsageSelection & { from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const {
    organization,
    project,
    organizations,
    projects,
    organizationChoices,
    projectChoices,
    canRead,
  } = await loadUsageContext(params);
  const today = new Date().toISOString().slice(0, 10);
  const issue = validateUsageDates(params.from, params.to, today);
  const report =
    organization && project && canRead && !issue
      ? await readUsageReport(
          organization.id,
          project.id,
          params.from,
          params.to,
        )
      : null;
  return (
    <div className="space-y-6">
      <header className="page-heading">
        <h1>Usage</h1>
        <p>
          Understand your project’s recorded API activity, one day at a time.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        {organizationChoices.length > 0 && (
          <OrganizationPicker
            organizations={organizationChoices}
            selected={organization?.id}
          />
        )}
        {organization && project && (
          <ProjectPicker
            organizationId={organization.id}
            projects={projectChoices}
            selected={project.id}
          />
        )}
      </div>
      <nav
        aria-label="Usage workspace and project pages"
        className="flex gap-4 text-xs underline empty:hidden"
      >
        {organizations.nextCursor && (
          <Link href={`/usage?organizationsAfter=${organizations.nextCursor}`}>
            More workspaces
          </Link>
        )}
        {params.organizationsAfter && (
          <Link href="/usage">First workspaces</Link>
        )}
        {projects?.nextCursor && (
          <Link
            href={`/usage?organization=${organization?.id}&projectsAfter=${projects.nextCursor}`}
          >
            More projects
          </Link>
        )}
        {params.projectsAfter && (
          <Link href={`/usage?organization=${organization?.id}`}>
            First projects
          </Link>
        )}
      </nav>
      {organization && project && canRead ? (
        <UsageFilters
          key={`${organization.id}-${project.id}-${params.from}-${params.to}`}
          organizationId={organization.id}
          projectId={project.id}
          from={report?.from ?? params.from ?? today}
          to={report?.to ?? params.to ?? today}
          today={today}
          {...(issue ? { initialError: issue } : {})}
        />
      ) : (
        <section className="rounded-xl border bg-white p-8">
          <h2 className="font-semibold">
            {organization && !canRead
              ? 'Access restricted'
              : 'Select a project to get started'}
          </h2>
          <p className="my-3 text-sm text-muted-foreground">
            {organization && !canRead
              ? 'Your role needs project.read and usage.read to use this reporting screen.'
              : 'Usage belongs to projects. Create a workspace and project, then send requests with a scoped API key.'}
          </p>
          <Link
            href={
              organization
                ? `/projects?organization=${organization.id}`
                : '/projects'
            }
            className="text-sm font-medium underline"
          >
            Open projects
          </Link>
        </section>
      )}
      {report && (
        <>
          <UsageMetrics metrics={report.totals} />
          <div className="grid gap-4 lg:grid-cols-2">
            <UsageChart
              report={report}
              metric="requestCount"
              title="Recorded requests"
            />
            <UsageChart
              report={report}
              metric="charactersProcessed"
              title="Submitted characters"
            />
          </div>
          <UsageDetails report={report} />
          <p className="text-xs text-muted-foreground">
            Report generated {report.generatedAt.slice(0, 19).replace('T', ' ')}{' '}
            UTC. Apply the range again to refresh.
          </p>
        </>
      )}
      <UsageNotice />
    </div>
  );
}
