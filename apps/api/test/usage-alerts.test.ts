import { describe, expect, it } from 'vitest';
import { dueAlerts } from '../src/common/billing/usage-alerts.js';

const block = {
  monthlyRequestLimit: 10_000n,
  monthlyCharacterLimit: 1_000_000n,
  overageMode: 'block' as const,
  requestCeiling: null,
  characterCeiling: null,
};
const overage = {
  ...block,
  overageMode: 'allow' as const,
  requestCeiling: 20_000n,
  characterCeiling: null,
};
const kinds = (alerts: ReturnType<typeof dueAlerts>) =>
  alerts.map((a) => `${a.kind}:${a.dimension}`);

describe('usage alert thresholds', () => {
  it('alerts at 80% and 100% of the allowance, not before', () => {
    expect(dueAlerts(block, { requests: 7_999n, characters: 0n })).toEqual([]);
    expect(dueAlerts(block, { requests: 8_000n, characters: 0n })).toEqual([
      {
        kind: 'allowance_80',
        dimension: 'requests',
        used: 8_000n,
        threshold: 8_000n,
        limit: 10_000n,
      },
    ]);
    expect(
      kinds(dueAlerts(block, { requests: 9_999n, characters: 0n })),
    ).toEqual(['allowance_80:requests']);
    expect(
      kinds(dueAlerts(block, { requests: 10_000n, characters: 0n })),
    ).toEqual(['allowance_80:requests', 'allowance_100:requests']);
  });

  it('rounds thresholds up and never alerts at zero usage', () => {
    const tiny = {
      ...block,
      monthlyRequestLimit: 1n,
      monthlyCharacterLimit: 0n,
    };
    expect(dueAlerts(tiny, { requests: 0n, characters: 0n })).toEqual([]);
    expect(kinds(dueAlerts(tiny, { requests: 1n, characters: 0n }))).toEqual([
      'allowance_80:requests',
      'allowance_100:requests',
    ]);
    // 80% of 7 is 5.6: alert from 6.
    const seven = { ...block, monthlyRequestLimit: 7n };
    expect(dueAlerts(seven, { requests: 5n, characters: 0n })).toEqual([]);
    expect(
      dueAlerts(seven, { requests: 6n, characters: 0n })[0]?.threshold,
    ).toBe(6n);
  });

  it('names the dimension further past its limit', () => {
    expect(
      kinds(dueAlerts(block, { requests: 8_100n, characters: 900_000n })),
    ).toEqual(['allowance_80:characters']);
    expect(
      kinds(dueAlerts(block, { requests: 9_000n, characters: 850_000n })),
    ).toEqual(['allowance_80:requests']);
  });

  it('ignores unlimited dimensions', () => {
    const unlimited = {
      ...block,
      monthlyRequestLimit: null,
      monthlyCharacterLimit: null,
    };
    expect(
      dueAlerts(unlimited, { requests: 10n ** 12n, characters: 10n ** 12n }),
    ).toEqual([]);
  });

  it('adds the ceiling alert on overage plans with a ceiling', () => {
    expect(
      kinds(dueAlerts(overage, { requests: 17_999n, characters: 0n })),
    ).toEqual(['allowance_80:requests', 'allowance_100:requests']);
    expect(
      kinds(dueAlerts(overage, { requests: 18_000n, characters: 0n })),
    ).toEqual([
      'allowance_80:requests',
      'allowance_100:requests',
      'ceiling_90:requests',
    ]);
    // No ceiling (unlimited overage) and block plans never get ceiling alerts.
    expect(
      kinds(
        dueAlerts(
          { ...overage, requestCeiling: null },
          { requests: 10n ** 9n, characters: 0n },
        ),
      ),
    ).not.toContain('ceiling_90:requests');
    expect(
      kinds(
        dueAlerts(
          { ...block, requestCeiling: 20_000n },
          { requests: 19_000n, characters: 0n },
        ),
      ),
    ).not.toContain('ceiling_90:requests');
  });
});
