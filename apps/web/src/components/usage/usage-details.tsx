import type { UsageReport } from '@/lib/platform-types';
import { formatUsageCount } from '@/lib/usage-range';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function UsageDetails({ report }: { report: UsageReport }) {
  return (
    <details className="rounded-xl border bg-white">
      <summary className="cursor-pointer p-5 text-sm font-semibold">
        Daily breakdown · {report.days.length} days
      </summary>
      <Table>
        <caption className="sr-only">
          Daily recorded usage in UTC. Today, if included, is partial.
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead>Date (UTC)</TableHead>
            <TableHead>Requests</TableHead>
            <TableHead>HTTP errors</TableHead>
            <TableHead>Submitted characters</TableHead>
            <TableHead>Average handler time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.days.map((day) => (
            <TableRow key={day.date}>
              <TableCell className="font-mono text-xs">{day.date}</TableCell>
              <TableCell>{formatUsageCount(day.requestCount)}</TableCell>
              <TableCell>{formatUsageCount(day.errorCount)}</TableCell>
              <TableCell>{formatUsageCount(day.charactersProcessed)}</TableCell>
              <TableCell>
                {day.averageProcessingTimeMs === null
                  ? '—'
                  : `${day.averageProcessingTimeMs} ms`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </details>
  );
}
