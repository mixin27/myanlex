import type { UsageStatement } from '@/lib/platform-types';
import { formatUsageCount } from '@/lib/usage-range';
import { ChargesTable } from '@/components/billing/charges';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** Billable monthly totals for a workspace, from the usage ledger. */
export function UsageStatementPanel({
  statement,
  months,
  selection,
}: {
  statement: UsageStatement;
  months: string[];
  /** Other query parameters to keep when choosing a month. */
  selection: Record<string, string>;
}) {
  const csv = `/v1/platform/organizations/${statement.organizationId}/usage-statements/${statement.month}/events.csv`;
  return (
    <section
      aria-labelledby="statement-heading"
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="statement-heading" className="font-semibold">
            Monthly statement
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Billable usage for the whole workspace: every request admitted by an
            API key or the playground, counted once it passes access and limit
            checks.
          </p>
        </div>
        <form method="get" className="flex items-end gap-2">
          {Object.entries(selection).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <label className="grid gap-1 text-xs font-medium">
            Month
            <select
              name="month"
              defaultValue={statement.month}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {monthName(month)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-9 rounded-md border px-3 text-sm font-medium"
          >
            Show
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{monthName(statement.month)}</span>
        <span className="rounded-full border px-3 py-0.5 text-xs">
          {statement.status === 'closed' ? 'Closed' : 'Open'}
        </span>
        <span className="text-muted-foreground">
          {statement.plan.name} plan ·{' '}
          {statement.status === 'closed' && statement.closedAt
            ? `Closed ${statement.closedAt.slice(0, 10)}`
            : 'Totals so far; the month closes after it ends'}
        </span>
      </div>

      {!statement.reconciled && (
        <p
          role="note"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
        >
          These totals differ from the workspace’s quota counter (
          {formatUsageCount(statement.counter.requests)} requests). This is
          expected for the month metering started, when earlier requests were
          counted without a ledger entry. Otherwise, contact your operator.
        </p>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm font-medium">Billable requests</dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">
            {formatUsageCount(statement.totals.requests)}
          </dd>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <dt className="text-sm font-medium">Billable characters</dt>
          <dd className="mt-2 text-2xl font-semibold tabular-nums">
            {formatUsageCount(statement.totals.characters)}
          </dd>
        </div>
      </dl>

      <div className="rounded-lg border bg-background p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Charges</h3>
          {statement.charges?.estimated && (
            <span className="rounded-full border px-2 py-0.5 text-xs">
              Estimate
            </span>
          )}
        </div>
        {statement.charges ? (
          <>
            <ChargesTable charges={statement.charges} />
            {statement.charges.estimated && (
              <p className="mt-2 text-xs text-muted-foreground">
                Priced on the current plan; the final amount is fixed when the
                month closes, on the plan in effect at the end of the month.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not priced: this month closed before plan pricing was available.
          </p>
        )}
      </div>

      {statement.lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No billable requests in {monthName(statement.month)}.
        </p>
      ) : (
        <Table>
          <caption className="sr-only">
            Billable usage by project and API key for{' '}
            {monthName(statement.month)}, UTC.
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Characters</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {statement.lines.map((line) => (
              <TableRow
                key={`${line.projectId}-${line.source}-${line.apiKey?.id ?? ''}`}
              >
                <TableCell>{line.projectName}</TableCell>
                <TableCell>
                  {line.apiKey ? (
                    <>
                      {line.apiKey.name ?? 'API key'}{' '}
                      <span className="font-mono text-xs text-muted-foreground">
                        {line.apiKey.prefix}
                      </span>
                    </>
                  ) : (
                    'Playground'
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsageCount(line.requests)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUsageCount(line.characters)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <p className="text-xs text-muted-foreground">
        {statement.ledgerAvailable ? (
          <>
            <a href={csv} className="font-medium underline">
              Download every request (CSV)
            </a>{' '}
            to check these totals line by line. No request text is included.
          </>
        ) : (
          'Request-level records for this month are past the retention period; the totals above are kept permanently.'
        )}{' '}
        Generated {statement.generatedAt.slice(0, 19).replace('T', ' ')} UTC.
      </p>
    </section>
  );
}
