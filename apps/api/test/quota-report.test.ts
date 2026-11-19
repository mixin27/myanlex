import { describe, expect, it } from 'vitest';
import { quotaDimension } from '../src/modules/platform/quota-report.service.js';

describe('quota report exact arithmetic', () => {
  it('preserves large counters', () => {
    expect(quotaDimension(9007199254740993n, 9007199254741000n)).toEqual({
      used: '9007199254740993',
      limit: '9007199254741000',
      remaining: '7',
      ceiling: '9007199254741000',
      overage: '0',
    });
  });
  it('clamps exhausted and downgraded plans without losing recorded usage', () => {
    expect(quotaDimension(20n, 10n)).toEqual({
      used: '20',
      limit: '10',
      remaining: '0',
      ceiling: '10',
      overage: '10',
    });
    expect(quotaDimension(0n, 0n).remaining).toBe('0');
  });
  it('distinguishes unlimited from zero allowance', () => {
    expect(quotaDimension(20n, null)).toEqual({
      used: '20',
      limit: null,
      remaining: null,
      ceiling: null,
      overage: '0',
    });
  });
  it('reports the ceiling and overage of overage plans', () => {
    expect(quotaDimension(150n, 100n, 200n)).toMatchObject({
      remaining: '0',
      ceiling: '200',
      overage: '50',
    });
    expect(quotaDimension(150n, 100n, null).ceiling).toBeNull();
  });
});
