/**
 * Usage alerts: which monthly thresholds a workspace has crossed. Each kind is
 * sent at most once per workspace per month (docs/platform.md, "Usage
 * alerts"). Integer arithmetic only.
 */
import type { PlanTerms } from './pricing.js';

export type UsageAlertKind = 'allowance_80' | 'allowance_100' | 'ceiling_90';
export type UsageDimension = 'requests' | 'characters';

export const USAGE_ALERT_KINDS: readonly UsageAlertKind[] = [
  'allowance_80',
  'allowance_100',
  'ceiling_90',
];

export interface DueAlert {
  readonly kind: UsageAlertKind;
  readonly dimension: UsageDimension;
  readonly used: bigint;
  /** The count at which the threshold is crossed (e.g. 80% of the allowance). */
  readonly threshold: bigint;
  /** The allowance or ceiling the percentage refers to. */
  readonly limit: bigint;
}

type Limits = Pick<
  PlanTerms,
  | 'monthlyRequestLimit'
  | 'monthlyCharacterLimit'
  | 'overageMode'
  | 'requestCeiling'
  | 'characterCeiling'
>;

/** ⌈limit × percent ÷ 100⌉, at least 1 so an empty allowance never alerts at 0. */
const percentOf = (limit: bigint, percent: bigint) => {
  const value = (limit * percent + 99n) / 100n;
  return value < 1n ? 1n : value;
};

export function dueAlerts(
  plan: Limits,
  usage: { readonly requests: bigint; readonly characters: bigint },
): DueAlert[] {
  const dimensions = [
    {
      dimension: 'requests' as const,
      used: usage.requests,
      allowance: plan.monthlyRequestLimit,
      ceiling: plan.requestCeiling,
    },
    {
      dimension: 'characters' as const,
      used: usage.characters,
      allowance: plan.monthlyCharacterLimit,
      ceiling: plan.characterCeiling,
    },
  ];
  const checks: {
    kind: UsageAlertKind;
    percent: bigint;
    of: 'allowance' | 'ceiling';
  }[] = [
    { kind: 'allowance_80', percent: 80n, of: 'allowance' },
    { kind: 'allowance_100', percent: 100n, of: 'allowance' },
    ...(plan.overageMode === 'allow'
      ? [{ kind: 'ceiling_90' as const, percent: 90n, of: 'ceiling' as const }]
      : []),
  ];
  const due: DueAlert[] = [];
  for (const check of checks) {
    let best: DueAlert | null = null;
    for (const entry of dimensions) {
      // A ceiling only applies to a limited dimension (enforcedLimits).
      const limit =
        check.of === 'allowance'
          ? entry.allowance
          : entry.allowance === null
            ? null
            : entry.ceiling;
      if (limit === null) continue;
      const threshold = percentOf(limit, check.percent);
      if (entry.used < threshold) continue;
      const candidate: DueAlert = {
        kind: check.kind,
        dimension: entry.dimension,
        used: entry.used,
        threshold,
        limit,
      };
      // Prefer the dimension further past its limit: used/limit is larger.
      if (!best || entry.used * best.limit > best.used * limit)
        best = candidate;
    }
    if (best) due.push(best);
  }
  return due;
}

/** Most severe first, for the portal notice. */
export function alertSeverity(
  kind: UsageAlertKind,
  overageMode: PlanTerms['overageMode'],
) {
  if (kind === 'allowance_100') return overageMode === 'block' ? 4 : 2;
  if (kind === 'ceiling_90') return 3;
  return 1;
}
