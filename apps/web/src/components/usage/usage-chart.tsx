import type { UsageReport } from '@/lib/platform-types';
import { formatUsageCount, usageBarPercent } from '@/lib/usage-range';

export function UsageChart({
  report,
  metric,
  title,
}: {
  report: UsageReport;
  metric: 'requestCount' | 'charactersProcessed';
  title: string;
}) {
  const maximum = report.days
    .reduce(
      (max, day) => (BigInt(day[metric]) > max ? BigInt(day[metric]) : max),
      BigInt(0),
    )
    .toString();
  const width = 900;
  const step = width / report.days.length;
  return (
    <figure className="min-w-0 rounded-xl border bg-white p-5">
      <figcaption className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          Daily · UTC · max {formatUsageCount(maximum)}
        </span>
      </figcaption>
      {maximum === '0' ? (
        <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          No {metric === 'requestCount' ? 'requests' : 'characters'} recorded in
          this range.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} 180`}
          className="h-40 w-full"
          role="img"
          aria-label={`${title}, ${report.from} to ${report.to}. Exact values in the daily breakdown below.`}
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            x2={width}
            y1="179"
            y2="179"
            stroke="currentColor"
            className="text-border"
          />
          {report.days.map((day, index) => {
            const height = usageBarPercent(day[metric], maximum) * 1.7;
            return (
              <rect
                key={day.date}
                x={index * step + 1}
                y={179 - height}
                width={Math.max(1, step - 2)}
                height={height}
                rx="2"
                className="fill-emerald-700"
              >
                <title>
                  {day.date}: {formatUsageCount(day[metric])}
                </title>
              </rect>
            );
          })}
        </svg>
      )}
      <div className="mt-3 flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>{report.from}</span>
        <span>{report.to}</span>
      </div>
    </figure>
  );
}
