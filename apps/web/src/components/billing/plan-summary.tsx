import type { BillingOverview, PlanTerms } from '@/lib/platform-types';
import { formatMoney } from '@/lib/money';
import { formatUsageCount } from '@/lib/usage-range';

const allowance = (value: string | null, unit: string) =>
  value === null ? `Unlimited ${unit}` : `${formatUsageCount(value)} ${unit}`;

/** Plain-language overage terms for one dimension. */
function overageTerm(
  plan: PlanTerms,
  limit: string | null,
  block: string,
  price: string,
  ceiling: string | null,
  unit: string,
) {
  if (limit === null) return null;
  if (plan.overageMode === 'block')
    return `Requests are refused once ${formatUsageCount(limit)} ${unit} are used in a month.`;
  return `${formatMoney(price, plan.currency)} per ${formatUsageCount(block)} ${unit} over the allowance${
    ceiling === null
      ? ''
      : `, up to ${formatUsageCount(ceiling)} ${unit} a month`
  }.`;
}

export function PlanCard({
  plan,
  compact = false,
}: {
  plan: PlanTerms & { description: string | null; source?: string };
  compact?: boolean;
}) {
  const terms = [
    overageTerm(
      plan,
      plan.monthlyRequestLimit,
      plan.requestBlock,
      plan.requestBlockPriceMinor,
      plan.requestCeiling,
      'requests',
    ),
    overageTerm(
      plan,
      plan.monthlyCharacterLimit,
      plan.characterBlock,
      plan.characterBlockPriceMinor,
      plan.characterCeiling,
      'characters',
    ),
  ].filter(Boolean);
  const Heading = compact ? 'h3' : 'h2';
  return (
    <section className="space-y-3 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {!compact && (
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Current plan
            </p>
          )}
          <Heading className="text-lg font-semibold">{plan.name}</Heading>
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(plan.baseFeeMinor, plan.currency)}
          <span className="text-sm font-normal text-muted-foreground">
            {' '}
            / month
          </span>
        </p>
      </div>
      {plan.description && (
        <p className="text-sm text-muted-foreground">{plan.description}</p>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Included each month</dt>
          <dd className="font-medium">
            {allowance(plan.monthlyRequestLimit, 'requests')} ·{' '}
            {allowance(plan.monthlyCharacterLimit, 'characters')}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Over the allowance</dt>
          <dd className="font-medium">
            {plan.overageMode === 'allow' ? 'Billed as overage' : 'Refused'}
          </dd>
        </div>
      </dl>
      {terms.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {terms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
      )}
      {!compact && plan.source === 'free' && (
        <p className="text-xs text-muted-foreground">
          Default plan for workspaces without a subscription.
        </p>
      )}
    </section>
  );
}

const statusLabel = {
  current: 'Current',
  scheduled: 'Scheduled',
  ended: 'Ended',
};

export function PlanHistory({
  periods,
}: {
  periods: BillingOverview['subscriptions'];
}) {
  return (
    <section
      aria-labelledby="history-heading"
      className="space-y-3 rounded-xl border bg-white p-5"
    >
      <h2 id="history-heading" className="font-semibold">
        Plan history
      </h2>
      {periods.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This workspace has always been on the default plan.
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Plan periods, newest first, UTC</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">Plan</th>
              <th className="py-2 font-medium">From</th>
              <th className="py-2 font-medium">Until</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id} className="border-b last:border-0">
                <td className="py-2">
                  {period.plan.name}
                  {period.note && (
                    <span className="block text-xs text-muted-foreground">
                      {period.note}
                    </span>
                  )}
                </td>
                <td className="py-2 tabular-nums">
                  {period.startsAt.slice(0, 10)}
                </td>
                <td className="py-2 tabular-nums">
                  {period.endsAt ? period.endsAt.slice(0, 10) : '—'}
                </td>
                <td className="py-2">{statusLabel[period.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-muted-foreground">
        When no plan period covers a date, the default Free plan applied.
      </p>
    </section>
  );
}
