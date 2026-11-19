import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UsageChart } from '../src/components/usage/usage-chart';
import { UsageMetrics } from '../src/components/usage/usage-metrics';
import { UsageDetails } from '../src/components/usage/usage-details';
import { UsageStatementPanel } from '../src/components/usage/usage-statement';
import type { UsageReport, UsageStatement } from '../src/lib/platform-types';

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

describe('monthly usage statement', () => {
  const statement: UsageStatement = {
    organizationId: 'org',
    month: '2026-10',
    timezone: 'UTC',
    periodStart: '2026-10-01T00:00:00.000Z',
    periodEnd: '2026-11-01T00:00:00.000Z',
    status: 'closed',
    billableUnit: 'admitted-request',
    generatedAt: '2026-11-19T10:00:00.000Z',
    closedAt: '2026-11-01T02:00:00.000Z',
    totals: { requests: '9007199254740993', characters: '12', events: '3' },
    counter: { requests: '9007199254740993', characters: '12' },
    reconciled: true,
    plan: {
      name: 'Free',
      slug: 'free',
      monthlyRequestLimit: null,
      monthlyCharacterLimit: null,
    },
    lines: [
      {
        projectId: 'p',
        projectName: 'Docs',
        source: 'api_key',
        apiKey: { id: 'k', name: 'CI', prefix: 'mlx_abc' },
        requests: '2',
        characters: '10',
      },
      {
        projectId: 'p',
        projectName: 'Docs',
        source: 'playground',
        apiKey: null,
        requests: '1',
        characters: '2',
      },
    ],
    ledgerAvailable: true,
  };
  const render = (value: UsageStatement) =>
    renderToStaticMarkup(
      <UsageStatementPanel
        statement={value}
        months={['2026-11', '2026-10']}
        selection={{ organization: 'org' }}
      />,
    );

  it('renders closed totals, the breakdown and the ledger download', () => {
    const html = render(statement);
    expect(html).toContain('October 2026');
    expect(html).toContain('Closed 2026-11-01');
    expect(html).toContain('9,007,199,254,740,993');
    expect(html).toContain('mlx_abc');
    expect(html).toContain('Playground');
    expect(html).toContain(
      'href="/v1/platform/organizations/org/usage-statements/2026-10/events.csv"',
    );
    expect(html).toContain('name="organization" value="org"');
    expect(html).not.toContain('differ from');
  });

  it('explains open months, mismatches and expired ledgers', () => {
    const html = render({
      ...statement,
      status: 'open',
      closedAt: null,
      reconciled: false,
      counter: { requests: '5', characters: '12' },
      lines: [],
      ledgerAvailable: false,
    });
    expect(html).toContain('Open');
    expect(html).toContain('the month closes after it ends');
    expect(html).toContain(
      'differ from the workspace’s quota counter (5 requests)',
    );
    expect(html).toContain('No billable requests in October 2026.');
    expect(html).not.toContain('events.csv');
    expect(html).toContain('past the retention period');
  });
});
