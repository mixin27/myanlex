import Link from 'next/link';
import {
  loadUsageContext,
  readUsageReport,
  type UsageSelection,
} from '@/lib/usage-server';
import { UsageMetrics } from './usage-metrics';

export async function DashboardUsage({
  selection,
}: {
  selection: UsageSelection;
}) {
  const { organization, project, canRead } = await loadUsageContext(selection);
  if (!organization || !project || !canRead)
    return (
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Project usage</h2>
        <p className="my-2 text-sm text-muted-foreground">
          {organization && !canRead
            ? 'Your role needs project.read and usage.read to view analytics.'
            : 'Create a project to see its recorded API activity.'}
        </p>
        <Link href="/usage" className="text-sm font-medium underline">
          Open usage reporting
        </Link>
      </section>
    );
  const today = new Date().toISOString().slice(0, 10);
  const report = await readUsageReport(
    organization.id,
    project.id,
    today,
    today,
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Today’s activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {organization.name} / {project.name} · {today} UTC · partial day
          </p>
        </div>
        <Link
          href={`/usage?organization=${organization.id}&project=${project.id}`}
          className="text-sm font-medium underline"
        >
          View usage report
        </Link>
      </div>
      <UsageMetrics metrics={report.totals} />
      <p className="text-xs text-muted-foreground">
        Recorded requests only. Best-effort metering; not a billing statement.
      </p>
    </section>
  );
}
