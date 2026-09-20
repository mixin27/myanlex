import { z } from 'zod';

export function validateUsageDates(
  from?: string,
  to?: string,
  today = new Date().toISOString().slice(0, 10),
): string | null {
  if (from === undefined && to === undefined) return null;
  if (!from || !to) return 'Choose both a start and an end date.';
  if (
    !z.iso.date().safeParse(from).success ||
    !z.iso.date().safeParse(to).success
  )
    return 'Use valid calendar dates.';
  const span =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000 +
    1;
  if (from < '1970-01-01' || span < 1 || span > 90 || to > today)
    return 'Choose 1–90 UTC days, ending no later than today (dates from 1970 onward).';
  return null;
}

export function formatUsageCount(value: string) {
  return BigInt(value).toLocaleString('en-US');
}

/** Scale before converting to Number so arbitrarily large counters stay exact. */
export function usageBarPercent(value: string, maximum: string): number {
  const max = BigInt(maximum);
  return max === BigInt(0)
    ? 0
    : Number((BigInt(value) * BigInt(10000)) / max) / 100;
}
