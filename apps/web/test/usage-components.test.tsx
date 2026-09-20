import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UsageChart } from '../src/components/usage/usage-chart';
import { UsageMetrics } from '../src/components/usage/usage-metrics';
import { UsageDetails } from '../src/components/usage/usage-details';
import type { UsageReport } from '../src/lib/platform-types';

const metrics = {
  requestCount: '2',
  errorCount: '1',
  charactersProcessed: '9007199254740993',
  processingTimeMs: '30',
  averageProcessingTimeMs: '15.00',
};
const report: UsageReport = {
  projectId: 'test',
  from: '2026-01-01',
  to: '2026-01-01',
  timezone: 'UTC',
  generatedAt: '2026-01-01T12:00:00Z',
  metering: 'best-effort',
  totals: metrics,
  days: [{ date: '2026-01-01', ...metrics }],
};
describe('usage UI markup without browser automation', () => {
  it('renders exact counters and explicit metric labels', () => {
    const html = renderToStaticMarkup(<UsageMetrics metrics={metrics} />);
    expect(html).toContain('9,007,199,254,740,993');
    expect(html).toContain('Submitted characters');
    expect(html).toContain('15.00 ms');
    expect(html).not.toContain('NaN');
  });
  it('provides a labeled daily chart and an exact-value table', () => {
    const chart = renderToStaticMarkup(
      <UsageChart
        report={report}
        metric="requestCount"
        title="Recorded requests"
      />,
    );
    expect(chart).toContain('role="img"');
    expect(chart).toContain('Exact values in the daily breakdown below.');
    expect(chart).toContain('height="170"');
    const table = renderToStaticMarkup(<UsageDetails report={report} />);
    expect(table).toContain('<caption');
    expect(table).toContain('2026-01-01');
    expect(table).toContain('9,007,199,254,740,993');
  });
  it('renders honest empty charts and no fabricated average', () => {
    const empty = {
      ...metrics,
      requestCount: '0',
      errorCount: '0',
      charactersProcessed: '0',
      processingTimeMs: '0',
      averageProcessingTimeMs: null,
    };
    const chart = renderToStaticMarkup(
      <UsageChart
        report={{
          ...report,
          totals: empty,
          days: [{ date: report.from, ...empty }],
        }}
        metric="requestCount"
        title="Recorded requests"
      />,
    );
    expect(chart).toContain('No requests recorded');
    expect(chart).not.toContain('<rect');
    expect(
      renderToStaticMarkup(<UsageMetrics metrics={empty} />),
    ).not.toContain('0.00 ms');
  });
});
