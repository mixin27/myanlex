import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  resolveUsageRange,
  summarizeUsage,
} from '../src/modules/platform/usage-report.service.js';

const now = new Date('2026-09-20T23:59:59Z');
describe('UTC usage ranges and exact aggregation', () => {
  it('defaults to 30 inclusive UTC dates, with an exclusive timestamp upper bound', () => {
    expect(resolveUsageRange({}, now)).toEqual({
      from: '2026-08-22',
      to: '2026-09-20',
      start: new Date('2026-08-22T00:00:00Z'),
      end: new Date('2026-09-21T00:00:00Z'),
      days: 30,
    });
  });
  it.each([
    { from: '2026-09-01' },
    { to: '2026-09-01' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '1969-12-31', to: '1970-01-01' },
    { from: '2026-09-20', to: '2026-09-19' },
    { from: '2026-09-20', to: '2026-09-21' },
    { from: '2026-01-01', to: '2026-09-20' },
  ])('rejects invalid or unbounded ranges %j', (input) => {
    expect(() => resolveUsageRange(input, now)).toThrow();
  });
  it('handles leap days and the 90-day boundary without local-time arithmetic', () => {
    expect(
      resolveUsageRange({ from: '2024-02-28', to: '2024-03-01' }, now).days,
    ).toBe(3);
    expect(
      resolveUsageRange({ from: '2026-06-23', to: '2026-09-20' }, now).days,
    ).toBe(90);
    expect(() =>
      resolveUsageRange({ from: '2026-06-22', to: '2026-09-20' }, now),
    ).toThrow();
  });
  it('fills missing days and derives weighted totals without numeric precision loss', () => {
    const range = resolveUsageRange(
      { from: '2026-09-18', to: '2026-09-20' },
      now,
    );
    const report = summarizeUsage(
      [
        {
          date: '2026-09-18',
          requestCount: 1n,
          errorCount: 0n,
          charactersProcessed: 9007199254740993n,
          processingTimeMs: 10n,
        },
        {
          date: '2026-09-20',
          requestCount: 3n,
          errorCount: 2n,
          charactersProcessed: 1n,
          processingTimeMs: 50n,
        },
      ],
      range,
    );
    expect(report.days.map((day) => day.date)).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
    expect(report.days[1]).toMatchObject({
      requestCount: '0',
      averageProcessingTimeMs: null,
    });
    expect(report.totals).toEqual({
      requestCount: '4',
      errorCount: '2',
      charactersProcessed: '9007199254740994',
      processingTimeMs: '60',
      averageProcessingTimeMs: '15.00',
    });
    expect(report.days[2]?.averageProcessingTimeMs).toBe('16.67');
    expect(() => JSON.stringify(report)).not.toThrow();
  });
  it('returns zero totals, not invented averages, for empty periods', () => {
    const report = summarizeUsage([], resolveUsageRange({}, now));
    expect(report.days).toHaveLength(30);
    expect(report.totals).toEqual({
      requestCount: '0',
      errorCount: '0',
      charactersProcessed: '0',
      processingTimeMs: '0',
      averageProcessingTimeMs: null,
    });
  });
});
