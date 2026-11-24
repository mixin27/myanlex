import type { UsageAlert } from '@/lib/platform-types';
import { formatUsageCount } from '@/lib/usage-range';

const severity = (alert: UsageAlert, overage: boolean) =>
  alert.kind === 'allowance_100'
    ? overage
      ? 2
      : 4
    : alert.kind === 'ceiling_90'
      ? 3
      : 1;

/** The most severe usage alert of the month, worst first. */
export function topUsageAlert(alerts: UsageAlert[], overage: boolean) {
  return [...alerts].sort(
    (a, b) => severity(b, overage) - severity(a, overage),
  )[0];
}

/**
 * Billing-page notice for this month's most severe usage alert (the same
 * thresholds are emailed to billing contacts).
 */
export function UsageAlertNotice({
  alerts,
  overage,
  resetsAt,
}: {
  alerts: UsageAlert[];
  /** Whether the current plan bills overage instead of refusing requests. */
  overage: boolean;
  /** ISO start of next month (UTC). */
  resetsAt: string;
}) {
  const alert = topUsageAlert(alerts, overage);
  if (!alert) return null;
  const amount = `${formatUsageCount(alert.used)} of ${formatUsageCount(alert.limit)}`;
  const resets = new Date(resetsAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
  const what = alert.dimension;
  const [title, detail] =
    alert.kind === 'allowance_80'
      ? [
          `You’ve used 80% of this month’s ${what} (${amount}).`,
          overage
            ? `Usage above the allowance is billed as overage. The allowance resets on ${resets}.`
            : `API requests are refused once the allowance is used up, until it resets on ${resets}.`,
        ]
      : alert.kind === 'ceiling_90'
        ? [
            `You’re close to this month’s overage ceiling (${amount} ${what}).`,
            `API requests are refused at the ceiling until ${resets}.`,
          ]
        : overage
          ? [
              `This month’s ${what} allowance is used up (${amount}).`,
              'Further usage is billed as overage on next month’s invoice.',
            ]
          : [
              `This month’s ${what} allowance is used up (${amount}).`,
              `API requests are refused until ${resets}, or until you move to a larger plan.`,
            ];
  const urgent = severity(alert, overage) >= 3;
  return (
    <section
      role={urgent ? 'alert' : 'status'}
      aria-label="Usage alert"
      className={`rounded-xl border p-4 text-sm ${urgent ? 'border-amber-300 bg-amber-50' : 'bg-white'}`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-muted-foreground">
        {detail}{' '}
        <a className="font-medium underline" href="#plans-heading">
          Compare plans
        </a>
      </p>
    </section>
  );
}
