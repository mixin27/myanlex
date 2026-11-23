import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
const { readPlatform } = vi.hoisted(() => ({ readPlatform: vi.fn() }));
vi.mock('../src/lib/platform-server', () => ({ readPlatform }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/billing',
}));
import BillingPage from '../src/app/(portal)/billing/page';
import type {
  BillingOverview,
  PlanChange,
  PlanTerms,
} from '../src/lib/platform-types';

const organization = '3a450187-fa8b-464f-9564-cb5cae9fcd94';
const org = { id: organization, name: 'Team', slug: 'team' };
const pro: PlanTerms = {
  name: 'Pro',
  slug: 'pro',
  monthlyRequestLimit: '100000',
  monthlyCharacterLimit: '10000000',
  currency: 'MMK',
  baseFeeMinor: '50000',
  overageMode: 'allow',
  requestBlock: '1000',
  requestBlockPriceMinor: '500',
  characterBlock: '100000',
  characterBlockPriceMinor: '300',
  requestCeiling: '200000',
  characterCeiling: null,
};
const overview: BillingOverview = {
  organizationId: organization,
  generatedAt: '2026-11-19T10:00:00.000Z',
  plan: { ...pro, source: 'subscription', description: 'For production apps' },
  currentMonth: {
    month: '2026-11',
    timezone: 'UTC',
    totals: { requests: '101001', characters: '5' },
    charges: {
      currency: 'MMK',
      baseFeeMinor: '50000',
      requests: {
        units: '1001',
        blocks: '2',
        blockSize: '1000',
        blockPriceMinor: '500',
        amountMinor: '1000',
      },
      characters: {
        units: '0',
        blocks: '0',
        blockSize: '100000',
        blockPriceMinor: '300',
        amountMinor: '0',
      },
      totalMinor: '51000',
      estimated: true,
    },
  },
  subscriptions: [
    {
      id: 's1',
      plan: { name: 'Pro', slug: 'pro' },
      startsAt: '2026-11-03T00:00:00.000Z',
      endsAt: null,
      status: 'current',
      note: 'Signed order 42',
    },
  ],
  publicPlans: [
    { ...pro, description: null, changePolicy: 'approval' },
    {
      ...pro,
      name: 'Team',
      slug: 'team',
      currency: 'USD',
      baseFeeMinor: '9900',
      overageMode: 'block',
      requestCeiling: null,
      description: null,
      changePolicy: 'approval',
    },
  ],
  changes: [],
  openChange: null,
  canRequestChange: false,
};
const pending: PlanChange = {
  id: 'c1',
  channel: 'approval',
  status: 'pending',
  fromPlanSlug: 'pro',
  plan: { name: 'Team', slug: 'team' },
  timing: 'next_month',
  requestedStartsAt: '2026-12-01T00:00:00.000Z',
  note: null,
  requesterEmail: 'owner@example.test',
  createdAt: '2026-11-19T09:00:00.000Z',
  decidedAt: null,
  decisionNote: null,
};
const rejected: PlanChange = {
  ...pending,
  id: 'c0',
  status: 'rejected',
  timing: 'now',
  requestedStartsAt: null,
  createdAt: '2026-11-10T09:00:00.000Z',
  decidedAt: '2026-11-11T09:00:00.000Z',
  decisionNote: 'Annual agreement needed first',
};
let current: BillingOverview = overview;

function serve(permissions: string[]) {
  readPlatform.mockImplementation(async (path: string) => {
    if (path === 'organizations') return { items: [org], nextCursor: null };
    if (path === `organizations/${organization}`)
      return { ...org, permissions };
    if (path === `organizations/${organization}/billing`) return current;
    throw new Error(`unexpected ${path}`);
  });
}
const render = async () =>
  renderToStaticMarkup(
    (await BillingPage({
      searchParams: Promise.resolve({ organization }),
    })) as ReactElement,
  ).replace(/\u00a0/g, ' ');

describe('billing page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    current = overview;
    vi.unstubAllEnvs();
  });

  it('shows the plan, the estimate, history and other public plans', async () => {
    serve(['billing.read']);
    vi.stubEnv('MYANLEX_BILLING_CONTACT', 'billing@example.test');
    const html = await render();
    for (const text of [
      'Current plan',
      'MMK 50,000',
      'For production apps',
      'MMK 500 per 1,000 requests over the allowance, up to 200,000 requests a month.',
      'Estimated total',
      'MMK 51,000',
      'Signed order 42',
      'Current',
      'Other plans',
      '$99.00',
      'Requests are refused once 100,000 requests are used in a month.',
      'href="mailto:billing@example.test"',
    ])
      expect(html).toContain(text);
    // The current plan is not repeated under "Other plans".
    expect(html.match(/For production apps/g)).toHaveLength(1);
  });

  it('does not fetch billing without billing.read', async () => {
    serve(['usage.read']);
    const html = await render();
    expect(html).toContain('Access restricted');
    expect(readPlatform.mock.calls.map(([path]) => path)).not.toContain(
      `organizations/${organization}/billing`,
    );
  });

  it('offers plan requests only to members who can manage billing', async () => {
    serve(['billing.read', 'billing.manage']);
    current = { ...overview, canRequestChange: true };
    const html = await render();
    // The current plan (Pro) is not offered; only Team is.
    expect(html.match(/Request this plan/g)).toHaveLength(1);
    expect(html).toContain('Switch to Free');
    expect(html).toContain('reviewed by the MyanLex team');

    current = overview;
    const readOnly = await render();
    expect(readOnly).not.toContain('Request this plan');
    expect(readOnly).not.toContain('Switch to Free');
    expect(readOnly).toContain('Ask a workspace Owner to change the plan.');
  });

  it('shows the open change instead of new requests, and the history', async () => {
    serve(['billing.read', 'billing.manage']);
    current = {
      ...overview,
      canRequestChange: true,
      openChange: pending,
      changes: [pending, rejected],
    };
    const html = await render();
    expect(html).toContain('Waiting for review: move to Team');
    expect(html).toContain('from 1 December 2026');
    expect(html).toContain('Cancel request');
    expect(html).not.toContain('Request this plan');
    expect(html).toContain('Plan change requests');
    expect(html).toContain('Not approved');
    expect(html).toContain('Annual agreement needed first');
  });

  it('rejects malformed workspace ids', async () => {
    await expect(
      BillingPage({ searchParams: Promise.resolve({ organization: 'x' }) }),
    ).rejects.toThrow('not-found');
  });
});
