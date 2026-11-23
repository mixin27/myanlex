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
import {
  PlanChangeError,
  type BillingOverview,
  type PlanChangeRecord,
} from '../src/modules/platform/usage-ledger.js';
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
  publicPlans: [
    { ...storeTerms(pro), description: null, changePolicy: 'approval' },
  ],
  changes: [],
};

const changeId = randomUUID();
const change: PlanChangeRecord = {
  id: changeId,
  channel: 'approval',
  status: 'pending',
  fromPlanSlug: 'pro',
  plan: { name: 'Team', slug: 'team' },
  timing: 'next_month',
  requestedStartsAt: new Date('2026-12-01T00:00:00.000Z'),
  note: 'PO 42',
  requesterEmail: 'o@example.com',
  createdAt: now,
  decidedAt: null,
  decisionNote: null,
};

const workspace = { getOrganization: vi.fn() };
const ledger = {
  billing: vi.fn(),
  requestPlanChange: vi.fn(),
  cancelPlanChange: vi.fn(),
};
const sendMail = vi.fn();
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
      notifyEmail: { value: 'billing@myanlex.test', writable: true },
    });
    Object.defineProperties(app.get(AccountAuthService), {
      auth: { value: { api: { getSession } } },
      publicURL: { value: origin },
      sendMail: { value: sendMail },
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
    ledger.requestPlanChange.mockResolvedValue(change);
    ledger.cancelPlanChange.mockResolvedValue({
      ...change,
      status: 'cancelled',
      decidedAt: now,
    });
    sendMail.mockResolvedValue('sent');
    app.get(BillingService)['notifyEmail' as never] =
      'billing@myanlex.test' as never;
  });
  const post = (
    path: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method: 'POST',
      url: `/v1/platform/organizations/${organizationId}/billing/${path}`,
      headers: { cookie: 'session=valid', origin, ...headers },
      ...(payload ? { payload } : {}),
    });

  it('requests plan changes with billing.manage only, and notifies the operator', async () => {
    const body = { planSlug: 'team', timing: 'next_month', note: 'PO 42' };
    expect((await post('plan-changes', body, { cookie: '' })).statusCode).toBe(
      401,
    );
    expect(
      (await post('plan-changes', body, { origin: 'https://evil.example' }))
        .statusCode,
    ).toBe(403);
    const forbidden = await post('plan-changes', body);
    expect(forbidden.statusCode).toBe(403);
    expect(ledger.requestPlanChange).not.toHaveBeenCalled();

    expect((await get()).json()).toMatchObject({
      canRequestChange: false,
      openChange: null,
      changes: [],
    });
    actsWith(['billing.read', 'billing.manage']);
    ledger.billing.mockResolvedValueOnce({ ...overview, changes: [change] });
    expect((await get()).json()).toMatchObject({
      canRequestChange: true,
      openChange: {
        id: changeId,
        requestedStartsAt: '2026-12-01T00:00:00.000Z',
      },
    });
    const created = await post('plan-changes', body);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      id: changeId,
      status: 'pending',
      timing: 'next_month',
      requestedStartsAt: '2026-12-01T00:00:00.000Z',
      notification: 'sent',
    });
    expect(ledger.requestPlanChange).toHaveBeenCalledWith(
      organizationId,
      expect.objectContaining({ userId, email: 'o@example.com' }),
      body,
    );
    const mail = sendMail.mock.calls[0]![0] as {
      to: string;
      subject: string;
      text: string;
    };
    expect(mail.to).toBe('billing@myanlex.test');
    expect(mail.subject).toBe('Plan change request: Acme → Team');
    expect(mail.text).toContain('pnpm billing:changes list');
    expect(mail.text).toContain('Note: PO 42');
  });

  it('keeps the request when mail is off or fails', async () => {
    actsWith(['billing.manage']);
    sendMail.mockResolvedValue('failed');
    const failed = await post('plan-changes', {
      planSlug: 'team',
      timing: 'now',
    });
    expect(failed.json().notification).toBe('failed');
    app.get(BillingService)['notifyEmail' as never] = null as never;
    sendMail.mockClear();
    const disabled = await post('plan-changes', {
      planSlug: 'team',
      timing: 'now',
    });
    expect(disabled.json().notification).toBe('disabled');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('validates the request and maps domain errors', async () => {
    actsWith(['billing.manage']);
    for (const payload of [
      { planSlug: 'Team!', timing: 'now' },
      { planSlug: 'team', timing: 'tomorrow' },
      { planSlug: 'team', timing: 'now', note: 'x'.repeat(501) },
      { planSlug: 'team', timing: 'now', extra: true },
    ])
      expect((await post('plan-changes', payload)).statusCode).toBe(400);
    for (const [code, status] of [
      ['unknown_plan', 400],
      ['current_plan', 400],
      ['open_change', 409],
    ] as const) {
      ledger.requestPlanChange.mockRejectedValueOnce(
        new PlanChangeError(code, `refused: ${code}`),
      );
      const response = await post('plan-changes', {
        planSlug: 'team',
        timing: 'now',
      });
      expect(response.statusCode, code).toBe(status);
      expect(response.json().detail).toBe(`refused: ${code}`);
    }
    ledger.requestPlanChange.mockRejectedValueOnce(new Error('db down'));
    const down = await post('plan-changes', {
      planSlug: 'team',
      timing: 'now',
    });
    expect(down.statusCode).toBe(503);
    expect(down.body).not.toContain('db down');
  });

  it('cancels only with billing.manage, mapping missing and closed changes', async () => {
    expect((await post(`plan-changes/${changeId}/cancel`)).statusCode).toBe(
      403,
    );
    actsWith(['billing.manage']);
    const cancelled = await post(`plan-changes/${changeId}/cancel`);
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ status: 'cancelled' });
    ledger.cancelPlanChange.mockRejectedValueOnce(
      new PlanChangeError('not_found', 'Plan change not found.'),
    );
    expect((await post(`plan-changes/${changeId}/cancel`)).statusCode).toBe(
      404,
    );
    ledger.cancelPlanChange.mockRejectedValueOnce(
      new PlanChangeError('not_open', 'Only waiting changes.'),
    );
    expect((await post(`plan-changes/${changeId}/cancel`)).statusCode).toBe(
      409,
    );
    expect((await post('plan-changes/not-a-uuid/cancel')).statusCode).toBe(400);
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
