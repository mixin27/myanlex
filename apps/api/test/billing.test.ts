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
  type InvoiceRecord,
  type PlanChangeRecord,
} from '../src/modules/platform/usage-ledger.js';
import type { WorkspaceRepository } from '../src/modules/platform/workspace.repository.js';
import {
  BillingProfileError,
  type BillingProfileRecord,
} from '../src/modules/platform/billing-profile.js';

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
    {
      ...storeTerms(pro),
      description: null,
      changePolicy: 'approval',
      change: {
        kind: 'upgrade',
        nowAllowed: true,
        prorationMinor: '20000',
        currency: 'MMK',
      },
    },
  ],
  freeChange: {
    kind: 'downgrade',
    nowAllowed: false,
    prorationMinor: null,
    currency: 'MMK',
  },
  outstanding: [
    {
      currency: 'MMK',
      totalMinor: 55_000n,
      invoices: 1,
      oldestDueAt: new Date('2026-11-08T00:00:00.000Z'),
      overdue: true,
    },
  ],
  suspended: { invoiceNumber: 'MLX-2026-000007', plan: 'pro' },
  changes: [],
};

const invoice: InvoiceRecord = {
  number: 'MLX-2026-000007',
  kind: 'monthly',
  status: 'open',
  periodStart: new Date('2026-11-01T00:00:00.000Z'),
  periodEnd: new Date('2026-12-01T00:00:00.000Z'),
  currency: 'MMK',
  subtotalMinor: 55_000n,
  totalMinor: 55_000n,
  issuedAt: new Date('2026-11-01T02:00:00.000Z'),
  dueAt: new Date('2026-11-08T02:00:00.000Z'),
  paidAt: null,
  voidedAt: null,
  voidReason: null,
  billTo: {
    name: 'Acme Trading Co., Ltd.',
    address: 'No. 1, Pyay Road\nYangon',
    taxId: '123456789',
    note: 'PO 42',
  },
  suspended: true,
  lines: [
    {
      kind: 'base_fee',
      description: 'Pro plan, November 2026',
      quantity: 1n,
      unitMinor: 50_000n,
      amountMinor: 50_000n,
    },
    {
      kind: 'request_overage',
      description: '60 requests over the allowance in October 2026 (2 × 50)',
      quantity: 2n,
      unitMinor: 2_500n,
      amountMinor: 5_000n,
    },
  ],
  payments: [],
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
  invoices: vi.fn(),
  invoice: vi.fn(),
};
const sendMail = vi.fn();
const profiles = {
  profile: vi.fn(),
  updateDetails: vi.fn(),
  addEmail: vi.fn(),
  resendEmail: vi.fn(),
  removeEmail: vi.fn(),
  confirmEmail: vi.fn(),
};
const emailId = randomUUID();
const profile: BillingProfileRecord = {
  details: {
    legalName: 'Acme Trading Co., Ltd.',
    address: 'No. 1, Pyay Road\nYangon',
    taxId: null,
    invoiceNote: 'PO 42',
  },
  emails: [
    {
      id: emailId,
      email: 'finance@acme.test',
      status: 'pending',
      sentAt: now,
      verifiedAt: null,
    },
  ],
};
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
      profiles: { value: profiles },
      notifyEmail: { value: 'billing@myanlex.test', writable: true },
      paymentInstructions: { value: 'KBZ Bank 123-456, MyanLex Co.' },
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
    profiles.profile.mockResolvedValue(profile);
    ledger.requestPlanChange.mockResolvedValue(change);
    ledger.cancelPlanChange.mockResolvedValue({
      ...change,
      status: 'cancelled',
      decidedAt: now,
    });
    sendMail.mockResolvedValue('sent');
    ledger.invoices.mockResolvedValue([invoice]);
    ledger.invoice.mockImplementation(async (_org: string, number: string) =>
      number === invoice.number ? invoice : null,
    );
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

  it('lists and shows invoices with billing.read, with payment instructions', async () => {
    const list = (query = '') =>
      app.inject({
        method: 'GET',
        url: `/v1/platform/organizations/${organizationId}/billing/invoices${query}`,
        headers: { cookie: 'session=valid', origin },
      });
    actsWith(['usage.read']);
    expect((await list()).statusCode).toBe(403);
    actsWith(['billing.read']);
    const page = await list('?limit=1');
    expect(page.statusCode).toBe(200);
    expect(ledger.invoices).toHaveBeenCalledWith(organizationId, null, 2);
    expect(page.json()).toMatchObject({
      items: [
        {
          number: 'MLX-2026-000007',
          totalMinor: '55000',
          overdue: true,
          suspended: true,
          lines: [
            { kind: 'base_fee', amountMinor: '50000' },
            { kind: 'request_overage' },
          ],
        },
      ],
      nextCursor: null,
    });
    expect((await list('?before=bad')).statusCode).toBe(400);
    const one = await list('/MLX-2026-000007');
    expect(one.statusCode).toBe(200);
    expect(one.json().paymentInstructions).toBe(
      'KBZ Bank 123-456, MyanLex Co.',
    );
    expect((await list('/MLX-2026-000099')).statusCode).toBe(404);
    expect((await list('/not-a-number')).statusCode).toBe(400);
    const overview = (await get()).json();
    expect(overview).toMatchObject({
      outstanding: [{ currency: 'MMK', totalMinor: '55000', overdue: true }],
      suspended: { invoiceNumber: 'MLX-2026-000007', plan: 'pro' },
      freeChange: { nowAllowed: false },
      paymentInstructions: 'KBZ Bank 123-456, MyanLex Co.',
    });
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
      ['timing_not_allowed', 400],
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

  describe('billing details', () => {
    const base = `/v1/platform/organizations/${organizationId}/billing`;
    const send = (
      method: 'PUT' | 'POST' | 'DELETE',
      path: string,
      payload?: object,
      headers: Record<string, string> = {},
    ) =>
      app.inject({
        method,
        url: `${base}/${path}`,
        headers: { cookie: 'session=valid', origin, ...headers },
        ...(payload ? { payload } : {}),
      });
    const details = {
      legalName: '  Acme Trading Co., Ltd. ',
      address: 'No. 1, Pyay Road\r\nYangon',
      taxId: '',
      invoiceNote: 'PO 42',
    };

    it('shows details and email status in the overview with billing.read', async () => {
      const body = (await get()).json();
      expect(body.profile).toEqual({
        legalName: 'Acme Trading Co., Ltd.',
        address: 'No. 1, Pyay Road\nYangon',
        taxId: null,
        invoiceNote: 'PO 42',
        emails: [
          {
            id: emailId,
            email: 'finance@acme.test',
            status: 'pending',
            sentAt: now.toISOString(),
            confirmedAt: null,
          },
        ],
      });
    });

    it('edits details with billing.manage only, trimmed and blank as null', async () => {
      profiles.updateDetails.mockResolvedValue(profile);
      expect(
        (await send('PUT', 'profile', details, { cookie: '' })).statusCode,
      ).toBe(401);
      expect((await send('PUT', 'profile', details)).statusCode).toBe(403);
      expect(profiles.updateDetails).not.toHaveBeenCalled();
      actsWith(['billing.read', 'billing.manage']);
      const response = await send('PUT', 'profile', details);
      expect(response.statusCode).toBe(200);
      expect(profiles.updateDetails).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({ userId, email: 'o@example.com' }),
        {
          legalName: 'Acme Trading Co., Ltd.',
          address: 'No. 1, Pyay Road\r\nYangon',
          taxId: null,
          invoiceNote: 'PO 42',
        },
      );
    });

    it('rejects control characters, long values and unknown fields', async () => {
      actsWith(['billing.manage']);
      for (const payload of [
        { ...details, legalName: 'Acme\u0007' },
        { ...details, invoiceNote: 'PO\n42' },
        { ...details, taxId: 'x'.repeat(65) },
        { ...details, address: 'x'.repeat(501) },
        { ...details, extra: true },
        { legalName: 'Acme' },
      ])
        expect((await send('PUT', 'profile', payload)).statusCode).toBe(400);
      expect(profiles.updateDetails).not.toHaveBeenCalled();
    });

    it('adds an email, sends a confirmation link and maps conflicts', async () => {
      actsWith(['billing.manage']);
      profiles.addEmail.mockResolvedValue({
        email: profile.emails[0],
        token: 't'.repeat(43),
        organizationName: 'Acme',
      });
      const response = await send('POST', 'emails', {
        email: ' Finance@Acme.test ',
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        email: 'finance@acme.test',
        status: 'pending',
        delivery: 'sent',
      });
      expect(profiles.addEmail).toHaveBeenCalledWith(
        organizationId,
        expect.objectContaining({ userId }),
        'finance@acme.test',
      );
      expect(sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'finance@acme.test',
          subject: 'Confirm billing email for Acme on MyanLex',
          text: expect.stringContaining(
            `${origin}/billing-email/confirm?token=${'t'.repeat(43)}`,
          ),
        }),
      );
      expect(
        (await send('POST', 'emails', { email: 'not-an-email' })).statusCode,
      ).toBe(400);
      for (const code of ['duplicate_email', 'email_limit'] as const) {
        profiles.addEmail.mockRejectedValueOnce(
          new BillingProfileError(code, 'conflict'),
        );
        expect(
          (await send('POST', 'emails', { email: 'a@acme.test' })).statusCode,
        ).toBe(409);
      }
      profiles.addEmail.mockRejectedValueOnce(new Error('database down'));
      expect(
        (await send('POST', 'emails', { email: 'a@acme.test' })).statusCode,
      ).toBe(503);
    });

    it('keeps a pending email when the confirmation cannot be sent', async () => {
      actsWith(['billing.manage']);
      profiles.addEmail.mockResolvedValue({
        email: profile.emails[0],
        token: 't'.repeat(43),
        organizationName: 'Acme',
      });
      sendMail.mockResolvedValue('failed');
      const response = await send('POST', 'emails', { email: 'a@acme.test' });
      expect(response.statusCode).toBe(201);
      expect(response.json().delivery).toBe('failed');
    });

    it('resends and removes with billing.manage, mapping errors', async () => {
      expect((await send('POST', `emails/${emailId}/resend`)).statusCode).toBe(
        403,
      );
      expect((await send('DELETE', `emails/${emailId}`)).statusCode).toBe(403);
      actsWith(['billing.manage']);
      profiles.resendEmail.mockResolvedValue({
        email: profile.emails[0],
        token: 'u'.repeat(43),
        organizationName: 'Acme',
      });
      expect((await send('POST', `emails/${emailId}/resend`)).statusCode).toBe(
        200,
      );
      expect(profiles.resendEmail).toHaveBeenCalledWith(
        organizationId,
        emailId,
      );
      profiles.resendEmail.mockRejectedValueOnce(
        new BillingProfileError('too_soon', 'wait'),
      );
      expect((await send('POST', `emails/${emailId}/resend`)).statusCode).toBe(
        409,
      );
      profiles.removeEmail.mockResolvedValue(undefined);
      const removed = await send('DELETE', `emails/${emailId}`);
      expect(removed.statusCode).toBe(204);
      profiles.removeEmail.mockRejectedValueOnce(
        new BillingProfileError('not_found', 'gone'),
      );
      expect((await send('DELETE', `emails/${emailId}`)).statusCode).toBe(404);
      expect((await send('DELETE', 'emails/not-a-uuid')).statusCode).toBe(400);
    });

    it('confirms by token without a session, by POST only', async () => {
      const url = '/v1/platform/billing-emails/confirm';
      profiles.confirmEmail.mockResolvedValue({
        organizationName: 'Acme',
        email: 'finance@acme.test',
      });
      const token = 'A'.repeat(43);
      const confirmed = await app.inject({
        method: 'POST',
        url,
        payload: { token },
      });
      expect(confirmed.statusCode).toBe(200);
      expect(confirmed.json()).toEqual({
        workspace: 'Acme',
        email: 'finance@acme.test',
      });
      expect(profiles.confirmEmail).toHaveBeenCalledWith(token);
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
      expect(
        (await app.inject({ method: 'POST', url, payload: { token: 'short' } }))
          .statusCode,
      ).toBe(400);
      profiles.confirmEmail.mockRejectedValueOnce(
        new BillingProfileError('invalid_or_expired', 'expired'),
      );
      const expired = await app.inject({
        method: 'POST',
        url,
        payload: { token },
      });
      expect(expired.statusCode).toBe(400);
      expect(expired.json().detail).toBe('expired');
    });

    it('returns the bill-to snapshot with an invoice', async () => {
      const body = (
        await app.inject({
          method: 'GET',
          url: `${base}/invoices/${invoice.number}`,
          headers: { cookie: 'session=valid', origin },
        })
      ).json();
      expect(body.billTo).toEqual(invoice.billTo);
    });
  });
});
