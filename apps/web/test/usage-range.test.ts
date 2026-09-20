import { describe, expect, it } from 'vitest';
import {
  formatUsageCount,
  usageBarPercent,
  validateUsageDates,
} from '../src/lib/usage-range';

describe('usage filters and chart values', () => {
  it('validates paired UTC dates with the same 90-day boundary as the API', () => {
    const today = '2026-09-20';
    expect(validateUsageDates(undefined, undefined, today)).toBeNull();
    expect(validateUsageDates('2026-06-23', today, today)).toBeNull();
    expect(validateUsageDates('2026-06-22', today, today)).not.toBeNull();
    expect(validateUsageDates('2026-02-30', today, today)).not.toBeNull();
    expect(validateUsageDates(today, undefined, today)).not.toBeNull();
    expect(validateUsageDates(today, '2026-09-21', today)).not.toBeNull();
    expect(validateUsageDates(today, '2026-09-19', today)).not.toBeNull();
  });
  it('formats huge counters without truncation or unsafe number conversion', () => {
    expect(formatUsageCount('9007199254740993')).toBe('9,007,199,254,740,993');
    expect(
      usageBarPercent('999999999999999999999', '999999999999999999999'),
    ).toBe(100);
    expect(usageBarPercent('1', '4')).toBe(25);
    expect(usageBarPercent('0', '0')).toBe(0);
  });
});
