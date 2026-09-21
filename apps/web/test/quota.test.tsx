import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { readPlatform, PlatformReadError } = vi.hoisted(() => ({
  readPlatform: vi.fn(),
  PlatformReadError: class extends Error {},
}));
vi.mock('../src/lib/platform-server', () => ({
  readPlatform,
  PlatformReadError,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
import { DashboardQuota } from '../src/components/usage/dashboard-quota';
import { QuotaSummary } from '../src/components/usage/quota-summary';
import type { QuotaReport } from '../src/lib/platform-types';

const org = {
  id: '3a450187-fa8b-464f-9564-cb5cae9fcd94',
  name: 'Team',
  slug: 'team',
  permissions: ['usage.read'],
};
const report: QuotaReport = {
  organizationId: org.id,
  enforcementEnabled: true,
  timezone: 'UTC',
  generatedAt: '2026-09-21T00:00:00Z',
  periodStart: '2026-09-01T00:00:00Z',
  resetsAt: '2026-10-01T00:00:00Z',
  metering: 'admission-reservations',
  plan: { name: 'Free', slug: 'free', source: 'free' },
  requests: { used: '12', limit: '10', remaining: '0' },
  characters: { used: '9007199254740993', limit: null, remaining: null },
};
describe('dashboard quotas without browser automation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readPlatform.mockImplementation(async (path: string) =>
      path.endsWith('/quota') ? report : org,
    );
  });
  it('renders exact counters, unlimited caps, exhaustion, and UTC reset', () => {
    const html = renderToStaticMarkup(<QuotaSummary report={report} />);
    for (const value of [
      '9,007,199,254,740,993',
      'Unlimited allowance',
      'Allowance exhausted',
      '2026-10-01',
      'UTC',
      'aria-valuenow="100"',
    ])
      expect(html).toContain(value);
    expect(html).not.toContain('NaN');
  });
  it('labels disabled enforcement and historical reservations', () => {
    const html = renderToStaticMarkup(
      <QuotaSummary report={{ ...report, enforcementEnabled: false }} />,
    );
    expect(html).toContain('Enforcement off');
    expect(html).toContain('traffic while enforcement is off is not counted');
    expect(html).not.toContain('Allowance exhausted');
  });
  it('handles zero limits without division by zero', () => {
    expect(
      renderToStaticMarkup(
        <QuotaSummary
          report={{
            ...report,
            requests: { used: '0', limit: '0', remaining: '0' },
          }}
        />,
      ),
    ).not.toContain('NaN');
  });
  it('does not require a project or project.read for workspace quotas', async () => {
    const html = renderToStaticMarkup(
      await DashboardQuota({ organizationId: org.id, organizations: [org] }),
    );
    expect(html).toContain('Workspace-wide');
    expect(readPlatform).toHaveBeenLastCalledWith(
      `organizations/${org.id}/quota`,
    );
    expect(readPlatform).toHaveBeenCalledTimes(2);
  });
  it('does not fetch quotas without permission', async () => {
    readPlatform.mockResolvedValue({ ...org, permissions: [] });
    expect(
      renderToStaticMarkup(
        await DashboardQuota({ organizationId: org.id, organizations: [org] }),
      ),
    ).toContain('needs usage.read');
    expect(readPlatform).toHaveBeenCalledTimes(1);
  });
  it('renders unavailability without fabricated counters and preserves navigation errors', async () => {
    readPlatform
      .mockResolvedValueOnce(org)
      .mockRejectedValueOnce(new PlatformReadError('failed'));
    const html = renderToStaticMarkup(
      await DashboardQuota({ organizationId: org.id, organizations: [org] }),
    );
    expect(html).toContain('temporarily unavailable');
    expect(html).not.toContain('remaining');
    readPlatform
      .mockResolvedValueOnce(org)
      .mockRejectedValueOnce(new Error('redirect'));
    await expect(
      DashboardQuota({ organizationId: org.id, organizations: [org] }),
    ).rejects.toThrow('redirect');
  });
  it('handles empty workspaces and rejects invalid selection', async () => {
    expect(
      renderToStaticMarkup(
        await DashboardQuota({ organizationId: undefined, organizations: [] }),
      ),
    ).toContain('Create a workspace');
    await expect(
      DashboardQuota({ organizationId: 'invalid', organizations: [] }),
    ).rejects.toThrow('not-found');
    expect(readPlatform).not.toHaveBeenCalled();
  });
});
