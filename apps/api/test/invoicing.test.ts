import { describe, expect, it } from 'vitest';
import {
  changeKind,
  daysInMonth,
  monthlyDrafts,
  prorate,
  prorationLine,
  remainingDays,
  sumLines,
} from '../src/common/billing/invoicing.js';
import type { StoredCharges } from '../src/common/billing/pricing.js';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const free = { slug: 'free', name: 'Free', currency: 'MMK', baseFeeMinor: 0n };
const pro = {
  slug: 'pro',
  name: 'Pro',
  currency: 'MMK',
  baseFeeMinor: 50_000n,
};
const scale = {
  slug: 'scale',
  name: 'Scale',
  currency: 'MMK',
  baseFeeMinor: 120_000n,
};
const team = {
  slug: 'team',
  name: 'Team',
  currency: 'USD',
  baseFeeMinor: 4_900n,
};

describe('proration', () => {
  it('counts UTC days including the start day', () => {
    expect(daysInMonth(utc('2026-11-15'))).toBe(30);
    expect(daysInMonth(utc('2026-02-10'))).toBe(28);
    expect(daysInMonth(utc('2028-02-10'))).toBe(29);
    expect(remainingDays(utc('2026-11-01'))).toBe(30);
    expect(remainingDays(utc('2026-11-30'))).toBe(1);
    // Late in the day still counts that day.
    expect(remainingDays(new Date('2026-11-30T23:59:59Z'))).toBe(1);
  });

  it('prorates by day with half-up rounding', () => {
    expect(prorate(50_000n, utc('2026-11-01'))).toBe(50_000n);
    expect(prorate(50_000n, utc('2026-11-16'))).toBe(25_000n); // 15 of 30
    expect(prorate(50_000n, utc('2026-11-30'))).toBe(1_667n); // 1666.67
    expect(prorate(4_900n, utc('2028-02-29'))).toBe(169n); // 1 of 29: 168.97
    expect(prorate(1n, utc('2026-11-16'))).toBe(1n); // 0.5 rounds up
    expect(prorate(0n, utc('2026-11-16'))).toBe(0n);
    expect(() => prorate(-1n, utc('2026-11-16'))).toThrow();
  });
});

describe('plan change billing', () => {
  it('classifies upgrades, downgrades and currency changes', () => {
    expect(changeKind(free, pro)).toBe('upgrade');
    expect(changeKind(null, team)).toBe('upgrade');
    expect(changeKind(pro, scale)).toBe('upgrade');
    expect(changeKind(scale, pro)).toBe('downgrade');
    expect(changeKind(pro, free)).toBe('downgrade');
    expect(changeKind(pro, { ...pro, slug: 'pro-2027' })).toBe('downgrade');
    expect(changeKind(pro, team)).toBe('currency');
    // From Free, any currency is a fresh start.
    expect(changeKind(free, team)).toBe('upgrade');
  });

  it('invoices the rest of the month: the full fee from Free, the difference on upgrade', () => {
    expect(prorationLine(free, pro, utc('2026-11-16'))).toMatchObject({
      kind: 'proration',
      quantity: 15n,
      unitMinor: 50_000n,
      amountMinor: 25_000n,
      planSlug: 'pro',
      description: 'Pro plan, 15 of 30 days in November 2026',
    });
    expect(prorationLine(pro, scale, utc('2026-11-16'))).toMatchObject({
      unitMinor: 70_000n,
      amountMinor: 35_000n,
      description: 'Scale plan from Pro, 15 of 30 days in November 2026',
    });
    expect(prorationLine(scale, pro, utc('2026-11-16'))).toBeNull();
    expect(prorationLine(pro, free, utc('2026-11-16'))).toBeNull();
    expect(() => prorationLine(pro, team, utc('2026-11-16'))).toThrow('1st');
  });
});

describe('monthly invoices', () => {
  const charges = (requestAmount: string, currency = 'MMK'): StoredCharges => ({
    currency,
    baseFeeMinor: '50000',
    requests: {
      units: '60',
      blocks: '2',
      blockSize: '50',
      blockPriceMinor: '2500',
      amountMinor: requestAmount,
    },
    characters: {
      units: '0',
      blocks: '0',
      blockSize: '100000',
      blockPriceMinor: '0',
      amountMinor: '0',
    },
    totalMinor: '55000',
  });
  const previous = (amount: string, currency = 'MMK') => ({
    monthStart: utc('2026-10-01'),
    planSlug: 'pro',
    charges: charges(amount, currency),
  });

  it('bills the month in advance and last month’s overage in arrears', () => {
    const [draft, ...rest] = monthlyDrafts(
      utc('2026-11-01'),
      pro,
      previous('5000'),
    );
    expect(rest).toEqual([]);
    expect(draft!.currency).toBe('MMK');
    expect(
      draft!.lines.map((line) => [
        line.kind,
        line.amountMinor,
        line.description,
      ]),
    ).toEqual([
      ['base_fee', 50_000n, 'Pro plan, November 2026'],
      [
        'request_overage',
        5_000n,
        '60 requests over the allowance in October 2026 (2 × 50)',
      ],
    ]);
    expect(sumLines(draft!.lines)).toBe(55_000n);
  });

  it('skips Free without overage, and splits currencies after a change', () => {
    expect(monthlyDrafts(utc('2026-11-01'), free, previous('0'))).toEqual([]);
    expect(monthlyDrafts(utc('2026-11-01'), null, null)).toEqual([]);
    const overageOnly = monthlyDrafts(
      utc('2026-11-01'),
      free,
      previous('5000'),
    );
    expect(
      overageOnly.map((draft) => draft.lines.map((line) => line.kind)),
    ).toEqual([['request_overage']]);
    const split = monthlyDrafts(utc('2026-11-01'), team, previous('5000'));
    expect(split.map((draft) => draft.currency).sort()).toEqual(['MMK', 'USD']);
  });
});
