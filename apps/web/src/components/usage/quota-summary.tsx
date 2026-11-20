import type { QuotaReport, QuotaDimension } from '@/lib/platform-types';
import { formatUsageCount } from '@/lib/usage-range';

function Allowance({
  label,
  dimension,
  enabled,
  overage,
}: {
  label: string;
  dimension: QuotaDimension;
  enabled: boolean;
  /** Overage plans bill usage above the allowance instead of denying it. */
  overage: boolean;
}) {
  const exhausted = dimension.remaining === '0';
  const over = dimension.overage !== '0';
  const ratio =
    dimension.limit === null
      ? null
      : BigInt(dimension.limit) === BigInt(0)
        ? BigInt(100)
        : (BigInt(dimension.used) * BigInt(100)) / BigInt(dimension.limit);
  const percentage =
    ratio === null ? null : Number(ratio > BigInt(100) ? BigInt(100) : ratio);
  return (
    <div className="min-w-0 rounded-lg border bg-background p-4">
      <h3 className="text-sm font-medium">{label}</h3>
      <p className="mt-3 break-words text-2xl font-semibold tabular-nums">
        {formatUsageCount(dimension.used)}{' '}
        <span className="text-sm font-normal text-muted-foreground">
          reserved
        </span>
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {dimension.limit === null
          ? 'Unlimited allowance'
          : `${formatUsageCount(dimension.limit)} monthly allowance`}
      </p>
      {percentage !== null && (
        <div
          role="progressbar"
          aria-label={`${label} allowance reserved`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
          className="my-3 h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            style={{ width: `${percentage}%` }}
            className={`h-full ${enabled && exhausted ? 'bg-amber-600' : 'bg-emerald-700'}`}
          />
        </div>
      )}
      <p className="mt-3 text-sm font-medium">
        {dimension.remaining === null
          ? 'No monthly cap'
          : overage && over
            ? `${formatUsageCount(dimension.overage)} over the allowance · billed as overage`
            : `${formatUsageCount(dimension.remaining)} remaining${enabled && exhausted && !overage ? ' · Allowance exhausted' : ''}`}
      </p>
      {overage && dimension.limit !== null && (
        <p className="mt-1 text-xs text-muted-foreground">
          {dimension.ceiling === null
            ? 'Usage above the allowance is billed; no ceiling.'
            : `Usage above the allowance is billed, up to a ceiling of ${formatUsageCount(dimension.ceiling)}.`}
        </p>
      )}
    </div>
  );
}

export function QuotaSummary({ report }: { report: QuotaReport }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {report.plan.name} plan{' '}
          <span className="font-normal text-muted-foreground">
            ·{' '}
            {report.plan.source === 'free'
              ? 'Default plan'
              : 'Active subscription'}
          </span>
        </p>
        <span className="rounded-full border px-3 py-1 text-xs">
          {report.enforcementEnabled ? 'Enforcement on' : 'Enforcement off'}
        </span>
      </div>
      {!report.enforcementEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          Limits are not enforced, so requests are not denied when an allowance
          runs out. Usage is still counted and appears on the monthly statement.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Allowance
          label="Requests"
          dimension={report.requests}
          enabled={report.enforcementEnabled}
          overage={report.plan.overageMode === 'allow'}
        />
        <Allowance
          label="Characters"
          dimension={report.characters}
          enabled={report.enforcementEnabled}
          overage={report.plan.overageMode === 'allow'}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Period starts {report.periodStart.slice(0, 10)} · Resets{' '}
        {report.resetsAt.slice(0, 10)} at 00:00 UTC
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        Shared by all projects and API keys in this workspace. Batches reserve
        one request and all submitted Unicode code points. Reservations include
        requests that later fail and match the monthly statement on the Usage
        page, which prices them on the workspace plan.
      </p>
      <p className="text-xs text-muted-foreground">
        Snapshot: {report.generatedAt.replace('T', ' ').replace('Z', ' UTC')}.
        Reload to refresh.
      </p>
    </div>
  );
}
