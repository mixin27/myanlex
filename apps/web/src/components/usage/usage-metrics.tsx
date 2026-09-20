import { Activity, CircleAlert, Clock3, Type } from 'lucide-react';
import type { UsageMetrics as Metrics } from '@/lib/platform-types';
import { formatUsageCount } from '@/lib/usage-range';

export function UsageMetrics({ metrics }: { metrics: Metrics }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        {
          label: 'Recorded requests',
          value: formatUsageCount(metrics.requestCount),
          note: 'One per HTTP request',
          icon: Activity,
        },
        {
          label: 'HTTP errors',
          value: formatUsageCount(metrics.errorCount),
          note: 'Recorded responses with status ≥ 400',
          icon: CircleAlert,
        },
        {
          label: 'Submitted characters',
          value: formatUsageCount(metrics.charactersProcessed),
          note: 'Unicode code points, including failed requests',
          icon: Type,
        },
        {
          label: 'Average handler time',
          value:
            metrics.averageProcessingTimeMs === null
              ? '—'
              : `${metrics.averageProcessingTimeMs} ms`,
          note: 'Excludes network and metering time',
          icon: Clock3,
        },
      ].map(({ label, value, note, icon: Icon }) => (
        <div key={label} className="min-w-0 rounded-xl border bg-white p-5">
          <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {label}
            <Icon className="size-4 shrink-0" />
          </dt>
          <dd className="my-3 break-words text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </dd>
          <dd className="text-xs leading-5 text-muted-foreground">{note}</dd>
        </div>
      ))}
    </dl>
  );
}
