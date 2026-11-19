import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';
import { BillingService } from '../src/modules/platform/billing.service.js';
import {
  priceUsage,
  storeCharges,
  storeTerms,
  type PlanTerms,
} from '../src/common/billing/pricing.js';
import type { BillingOverview } from '../src/modules/platform/usage-ledger.js';
import type { WorkspaceRepository } from '../src/modules/platform/workspace.repository.js';

const userId = randomUUID();
const organizationId = randomUUID();
const origin = 'http://localhost:3000';
const now = new Date('2026-11-19T10:00:00.000Z');
const pro: PlanTerms = {
  name: 'Pro',
  slug: 'pro',
  monthlyRequestLimit: 100n,
  monthlyCharacterLimit: null,
  currency: 'MMK',
  baseFeeMinor: 50_000n,
  overageMode: 'allow',
  requestBlock: 10n,
  requestBlockPriceMinor: 500n,
  characterBlock: 100_000n,
  characterBlockPriceMinor: 0n,
  requestCeiling: 1_000n,
  characterCeiling: null,
};
const overview: BillingOverview = {
  now,
  plan: { ...storeTerms(pro), source: 'subscription', description: 'Paid' },
  subscriptions: [
    {
      id: 'a',
      plan: { name: 'Team', slug: 'team' },
      startsAt: new Date('2026-12-01T00:00:00.000Z'),
      endsAt: null,
      note: null,
    },
    {
      id: 'b',
      plan: { name: 'Pro', slug: 'pro' },
      startsAt: new Date('2026-11-03T00:00:00.000Z'),
      endsAt: new Date('2026-12-01T00:00:00.000Z'),
      note: 'Order 42',
    },
    {
      id: 'c',
      plan: { name: 'Starter', slug: 'starter' },
      startsAt: new Date('2026-10-01T00:00:00.000Z'),
      endsAt: new Date('2026-11-03T00:00:00.000Z'),
      note: null,
    },
  ],
  month: {
    monthStart: new Date('2026-11-01T00:00:00.000Z'),
    requests: 111n,
    characters: 9n,
    charges: storeCharges(priceUsage(pro, { requests: 111n, characters: 9n })),
  },
  publicPlans: [{ ...storeTerms(pro), description: null }],
};

const workspace = { getOrganization: vi.fn() };
const ledger = { billing: vi.fn() };
const actsWith = (permissions: string[] | null) =>
  workspace.getOrganization.mockImplementation(
    async (_u: string, id: string) =>
      id === organizationId && permissions
        ? { id, name: 'Acme', slug: 'acme', permissions }
        : null,
  );

describe('billing HTTP contract', () => {
  let app: NestFastifyApplication;
  const getSession = vi.fn();
  const get = (headers: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url: `/v1/platform/organizations/${organizationId}/billing`,
      headers: { cookie: 'session=valid', origin, ...headers },
    });

  beforeAll(async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    app = await createApiApplication({
      apiKey: 'bootstrap-test',
      logger: false,
      rateLimitMaxRequests: 1000,
    });
    Object.defineProperties(app.get(BillingService), {
      workspace: { value: workspace as unknown as WorkspaceRepository },
      ledger: { value: ledger },
    });
    Object.defineProperties(app.get(AccountAuthService), {
      auth: { value: { api: { getSession } } },
      publicURL: { value: origin },
    });
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockImplementation(async ({ headers }: { headers: Headers }) =>
      headers.get('cookie') === 'session=valid'
        ? { user: { id: userId, email: 'o@example.com', emailVerified: true } }
        : null,
    );
    actsWith(['billing.read']);
    ledger.billing.mockResolvedValue(overview);
  });

  it('requires a session, membership and billing.read', async () => {
    expect((await get({ cookie: '' })).statusCode).toBe(401);
    actsWith(null);
    expect((await get()).statusCode).toBe(404);
    actsWith(['usage.read', 'billing.manage']);
    const forbidden = await get();
    expect(forbidden.statusCode).toBe(403);
    expect(ledger.billing).not.toHaveBeenCalled();
  });

  it('returns the plan, an estimate and dated plan periods', async () => {
    const response = await get();
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toMatchObject({
      organizationId,
      generatedAt: now.toISOString(),
      plan: {
        slug: 'pro',
        currency: 'MMK',
        baseFeeMinor: '50000',
        requestCeiling: '1000',
      },
      currentMonth: {
        month: '2026-11',
        totals: { requests: '111', characters: '9' },
        charges: {
          estimated: true,
          requests: { units: '11', blocks: '2', amountMinor: '1000' },
          totalMinor: '51000',
        },
      },
      subscriptions: [
        { id: 'a', status: 'scheduled', endsAt: null },
        { id: 'b', status: 'current', note: 'Order 42' },
        { id: 'c', status: 'ended' },
      ],
      publicPlans: [{ slug: 'pro' }],
    });
  });

  it('reports 503 when billing cannot be read', async () => {
    ledger.billing.mockRejectedValue(new Error('database down'));
    const response = await get();
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('database down');
  });
});
