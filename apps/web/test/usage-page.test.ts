import { beforeEach, describe, expect, it, vi } from 'vitest';
const { readPlatform } = vi.hoisted(() => ({ readPlatform: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/platform-server', () => ({ readPlatform }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
import UsagePage from '../src/app/(portal)/usage/page';
import { DashboardUsage } from '../src/components/usage/dashboard-usage';
import { loadUsageContext } from '../src/lib/usage-server';

const organization = '3a450187-fa8b-464f-9564-cb5cae9fcd94';
const project = '8c3ce397-b77e-4b5d-9330-9ae38560734d';
const org = {
  id: organization,
  name: 'Team',
  slug: 'team',
  permissions: ['project.read', 'usage.read'],
};
const projectData = {
  id: project,
  organizationId: organization,
  name: 'App',
  slug: 'app',
  environment: 'development',
};
const totals = {
  requestCount: '0',
  errorCount: '0',
  charactersProcessed: '0',
  processingTimeMs: '0',
  averageProcessingTimeMs: null,
};
describe('usage screens', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    readPlatform.mockImplementation(async (path: string) => {
      if (path === 'organizations') return { items: [org], nextCursor: null };
      if (path === `organizations/${organization}`) return org;
      if (path === `organizations/${organization}/projects`)
        return { items: [projectData], nextCursor: null };
      if (path.includes('/usage'))
        return {
          projectId: project,
          from: '2026-01-01',
          to: '2026-01-02',
          totals,
          days: [],
          generatedAt: '2026-01-02T12:00:00Z',
          metering: 'best-effort',
          timezone: 'UTC',
        };
      throw new Error(`Unexpected path: ${path}`);
    });
  });
  it('requests a bounded report for the selected tenant and project', async () => {
    await UsagePage({
      searchParams: Promise.resolve({
        organization,
        project,
        from: '2026-01-01',
        to: '2026-01-02',
      }),
    });
    expect(readPlatform).toHaveBeenLastCalledWith(
      `organizations/${organization}/projects/${project}/usage?from=2026-01-01&to=2026-01-02`,
    );
  });
  it('does not fetch reports for invalid dates', async () => {
    await UsagePage({
      searchParams: Promise.resolve({
        organization,
        project,
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    });
    expect(
      readPlatform.mock.calls.some(([path]) => path.includes('/usage')),
    ).toBe(false);
  });
  it('does not fetch project data or totals without usage.read', async () => {
    readPlatform
      .mockResolvedValueOnce({ items: [org], nextCursor: null })
      .mockResolvedValueOnce({ ...org, permissions: ['project.read'] });
    await UsagePage({
      searchParams: Promise.resolve({ organization, project }),
    });
    expect(readPlatform).toHaveBeenCalledTimes(2);
  });
  it('resolves project selections outside the loaded page with a scoped lookup', async () => {
    readPlatform
      .mockResolvedValueOnce({ items: [org], nextCursor: null })
      .mockResolvedValueOnce(org)
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce(projectData);
    const context = await loadUsageContext({ organization, project });
    expect(context.projectChoices).toEqual([projectData]);
    expect(readPlatform).toHaveBeenLastCalledWith(
      `organizations/${organization}/projects/${project}`,
    );
  });
  it('rejects malformed tenant context before making requests', async () => {
    await expect(
      loadUsageContext({ organization: '../other' }),
    ).rejects.toThrow('not-found');
    expect(readPlatform).not.toHaveBeenCalled();
  });
  it('limits overview metrics to the current UTC day and selected project', async () => {
    await DashboardUsage({ selection: { organization, project } });
    const today = new Date().toISOString().slice(0, 10);
    expect(readPlatform).toHaveBeenLastCalledWith(
      `organizations/${organization}/projects/${project}/usage?from=${today}&to=${today}`,
    );
  });
  it('propagates persistence failures instead of displaying zero usage', async () => {
    readPlatform.mockRejectedValue(new Error('Database unavailable'));
    await expect(
      UsagePage({ searchParams: Promise.resolve({ organization, project }) }),
    ).rejects.toThrow('Database unavailable');
  });
});
