/**
 * Invoice arithmetic (ADR 0026). Base fees are prepaid per UTC month and
 * prorated by day for mid-month starts and upgrades; overage is billed in
 * arrears from the closed statement. Amounts are bigint minor units.
 */
import type { PlanTerms, StoredCharges } from './pricing.js';

export type InvoiceLineKind =
  'base_fee' | 'proration' | 'request_overage' | 'character_overage';

export interface InvoiceLineDraft {
  readonly kind: InvoiceLineKind;
  readonly description: string;
  readonly quantity: bigint;
  readonly unitMinor: bigint;
  readonly amountMinor: bigint;
  readonly planSlug: string;
}

/** Days are UTC calendar days. */
export const monthStartOf = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
export const nextMonthStartOf = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
export const daysInMonth = (date: Date) =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();

/** Days left in the month counting the start day itself. */
export const remainingDays = (startsAt: Date) =>
  daysInMonth(startsAt) - startsAt.getUTCDate() + 1;

const monthName = (date: Date) =>
  date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** amount × numerator ÷ denominator, rounded half up. */
const share = (amount: bigint, numerator: number, denominator: number) =>
  (amount * BigInt(numerator) * 2n + BigInt(denominator)) /
  (2n * BigInt(denominator));

/** The rest of the month's base fee from `startsAt` (the whole fee on the 1st). */
export function prorate(feeMinor: bigint, startsAt: Date): bigint {
  if (feeMinor < 0n) throw new Error('Invalid fee');
  return share(feeMinor, remainingDays(startsAt), daysInMonth(startsAt));
}

type Fee = Pick<PlanTerms, 'slug' | 'name' | 'currency' | 'baseFeeMinor'>;

/** How a plan change is billed: immediately (prorated) or from next month. */
export function changeKind(
  from: Fee | null,
  to: Fee,
): 'upgrade' | 'downgrade' | 'currency' {
  if (to.slug === 'free') return 'downgrade';
  if (!from || from.slug === 'free' || from.baseFeeMinor === 0n)
    return 'upgrade';
  if (from.currency !== to.currency) return 'currency';
  return to.baseFeeMinor > from.baseFeeMinor ? 'upgrade' : 'downgrade';
}

/**
 * The prorated line for moving to `to` at `startsAt`, or null when nothing
 * is owed (downgrades, Free, equal fees). Throws for a currency change, which
 * may only start on the 1st of a month.
 */
export function prorationLine(
  from: Fee | null,
  to: Fee,
  startsAt: Date,
): InvoiceLineDraft | null {
  const kind = changeKind(from, to);
  if (kind === 'currency')
    throw new Error('A currency change can only start on the 1st of a month.');
  if (kind === 'downgrade') return null;
  const credit = from && from.currency === to.currency ? from.baseFeeMinor : 0n;
  const monthly = to.baseFeeMinor - credit;
  if (monthly <= 0n) return null;
  const days = remainingDays(startsAt);
  const total = daysInMonth(startsAt);
  const amount = prorate(monthly, startsAt);
  if (amount === 0n) return null;
  return {
    kind: 'proration',
    description:
      credit > 0n
        ? `${to.name} plan from ${from!.name}, ${days} of ${total} days in ${monthName(startsAt)}`
        : `${to.name} plan, ${days} of ${total} days in ${monthName(startsAt)}`,
    quantity: BigInt(days),
    unitMinor: monthly,
    amountMinor: amount,
    planSlug: to.slug,
  };
}

/**
 * Drafts of the invoices issued on the 1st of `monthStart`: the month's base
 * fee on the plan in effect that day, and the overage of the month just
 * closed. One draft per currency (two only around a currency change).
 */
export function monthlyDrafts(
  monthStart: Date,
  plan: Fee | null,
  previous: {
    readonly monthStart: Date;
    readonly planSlug: string;
    readonly charges: StoredCharges | null;
  } | null,
): { currency: string; lines: InvoiceLineDraft[] }[] {
  const drafts = new Map<string, InvoiceLineDraft[]>();
  const add = (currency: string, line: InvoiceLineDraft) =>
    drafts.set(currency, [...(drafts.get(currency) ?? []), line]);
  if (plan && plan.slug !== 'free' && plan.baseFeeMinor > 0n)
    add(plan.currency, {
      kind: 'base_fee',
      description: `${plan.name} plan, ${monthName(monthStart)}`,
      quantity: 1n,
      unitMinor: plan.baseFeeMinor,
      amountMinor: plan.baseFeeMinor,
      planSlug: plan.slug,
    });
  const charges = previous?.charges;
  if (charges)
    for (const [kind, line, unit] of [
      ['request_overage', charges.requests, 'requests'],
      ['character_overage', charges.characters, 'characters'],
    ] as const) {
      const amount = BigInt(line.amountMinor);
      if (amount === 0n) continue;
      add(charges.currency, {
        kind,
        description: `${BigInt(line.units).toLocaleString('en-US')} ${unit} over the allowance in ${monthName(previous.monthStart)} (${line.blocks} × ${BigInt(line.blockSize).toLocaleString('en-US')})`,
        quantity: BigInt(line.blocks),
        unitMinor: BigInt(line.blockPriceMinor),
        amountMinor: amount,
        planSlug: previous.planSlug,
      });
    }
  return [...drafts].map(([currency, lines]) => ({ currency, lines }));
}

export const sumLines = (lines: readonly InvoiceLineDraft[]) =>
  lines.reduce((total, line) => total + line.amountMinor, 0n);

/** Invoices are due seven days after issue (ADR 0026). */
export const PAYMENT_TERMS_DAYS = 7;
/** Reminders on days 0, 3 and 6 after issue; suspension once overdue. */
export const REMINDER_DAYS = [0, 3, 6] as const;
