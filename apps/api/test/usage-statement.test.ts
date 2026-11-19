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
import { UsageStatementService } from '../src/modules/platform/usage-statement.service.js';
import { csvField } from '../src/modules/platform/usage-statement.schemas.js';
import type {
  LedgerEvent,
  UsageLedgerRepository,
  UsageStatementRecord,
} from '../src/modules/platform/usage-ledger.js';
import type { WorkspaceRepository } from '../src/modules/platform/workspace.repository.js';
import { permissionCatalog } from '../src/modules/platform/permission-catalog.js';

const userId = randomUUID();
const organizationId = randomUUID();
const projectId = randomUUID();
const keyId = randomUUID();
const origin = 'http://localhost:3000';
const allPermissions = permissionCatalog.map(([key]) => key).sort();
const november = new Date('2026-11-01T00:00:00.000Z');

const record = (
  overrides: Partial<UsageStatementRecord> = {},
): UsageStatementRecord => ({
  organizationId,
  monthStart: november,
  status: 'open',
  requestCount: 3n,
  characterCount: 12n,
  eventCount: 3n,
  counterRequests: 3n,
  counterCharacters: 12n,
  reconciled: true,
  plan: {
    name: 'Free',
    slug: 'free',
    monthlyRequestLimit: '10000',
    monthlyCharacterLimit: '1000000',
  },
  lines: [
    {
      projectId,
      projectName: 'Docs',
      source: 'api_key',
      apiKeyId: keyId,
      apiKeyName: 'CI',
      apiKeyPrefix: 'mlx_abc',
      events: 2n,
      requests: 2n,
      characters: 10n,
    },
    {
      projectId,
      projectName: 'Docs',
      source: 'playground',
      apiKeyId: null,
      apiKeyName: null,
      apiKeyPrefix: null,
      events: 1n,
      requests: 1n,
      characters: 2n,
    },
  ],
  closedAt: null,
  generatedAt: new Date('2026-11-19T10:00:00.000Z'),
  ...overrides,
});
const event = (index: number): LedgerEvent => ({
  id: randomUUID(),
  createdAt: new Date(Date.UTC(2026, 10, 1, 0, 0, index)),
  requestId: `req-${index}`,
  projectId,
  projectName: index === 0 ? '=HYPERLINK("x")' : 'Docs, main',
  source: 'api_key',
  apiKeyPrefix: 'mlx_abc',
  endpoint: '/v1/text/normalize',
  requestUnits: 1,
  characters: BigInt(index),
});

const workspace = { getOrganization: vi.fn() };
const ledger: { [K in keyof UsageLedgerRepository]: ReturnType<typeof vi.fn> } =
  {
    currentMonth: vi.fn(),
    statement: vi.fn(),
    events: vi.fn(),
    closeFinishedMonths: vi.fn(),
    cleanup: vi.fn(),
  };

function actsWith(permissions: string[] | null) {
  workspace.getOrganization.mockImplementation(
    async (_u: string, id: string) =>
      id === organizationId && permissions
        ? { id, name: 'Acme', slug: 'acme', permissions }
        : null,
  );
}

describe('usage statement HTTP contract', () => {
  let app: NestFastifyApplication;
  const getSession = vi.fn();
  const get = (path: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url: `/v1/platform/organizations/${organizationId}/usage-statements${path}`,
      headers: { cookie: 'session=valid', origin, ...headers },
    });

  beforeAll(async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    app = await createApiApplication({
      apiKey: 'bootstrap-test',
      logger: false,
      rateLimitMaxRequests: 1000,
    });
    Object.defineProperties(app.get(UsageStatementService), {
      workspace: { value: workspace as unknown as WorkspaceRepository },
      ledger: { value: ledger },
      retentionMonths: { value: 13 },
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
    actsWith(allPermissions);
    ledger.currentMonth.mockResolvedValue(november);
    ledger.statement.mockResolvedValue(record());
    ledger.events.mockResolvedValue([]);
  });

  it('requires a session, membership and usage.read', async () => {
    expect((await get('', { cookie: '' })).statusCode).toBe(401);
    actsWith(null);
    expect((await get('')).statusCode).toBe(404);
    expect((await get('/2026-11/events.csv')).statusCode).toBe(404);
    actsWith(allPermissions.filter((key) => key !== 'usage.read'));
    const forbidden = await get('?month=2026-11');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers['cache-control']).toBe('private, no-store');
    expect(ledger.statement).not.toHaveBeenCalled();
  });

  it('returns the current month by default with decimal-string totals', async () => {
    const response = await get('');
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(ledger.statement).toHaveBeenCalledWith(organizationId, november);
    expect(response.json()).toMatchObject({
      month: '2026-11',
      periodStart: '2026-11-01T00:00:00.000Z',
      periodEnd: '2026-12-01T00:00:00.000Z',
      status: 'open',
      billableUnit: 'admitted-request',
      closedAt: null,
      totals: { requests: '3', characters: '12', events: '3' },
      counter: { requests: '3', characters: '12' },
      reconciled: true,
      ledgerAvailable: true,
      lines: [
        {
          source: 'api_key',
          apiKey: { id: keyId, name: 'CI', prefix: 'mlx_abc' },
          requests: '2',
        },
        { source: 'playground', apiKey: null, characters: '2' },
      ],
    });
  });

  it('reports closed months, unreconciled totals and expired ledgers', async () => {
    ledger.statement.mockResolvedValueOnce(
      record({
        monthStart: new Date('2025-09-01T00:00:00.000Z'),
        status: 'closed',
        reconciled: false,
        counterRequests: 5n,
        closedAt: new Date('2025-10-02T01:00:00.000Z'),
      }),
    );
    const old = await get('?month=2025-09');
    expect(old.statusCode).toBe(200);
    expect(old.json()).toMatchObject({
      month: '2025-09',
      status: 'closed',
      reconciled: false,
      counter: { requests: '5' },
      closedAt: '2025-10-02T01:00:00.000Z',
      ledgerAvailable: false,
    });
    expect((await get('/2025-09/events.csv')).statusCode).toBe(410);
    expect((await get('/2025-10/events.csv')).statusCode).toBe(200);
    expect(ledger.events).toHaveBeenCalledOnce();
  });

  it('validates months', async () => {
    for (const query of [
      '?month=2026-13',
      '?month=2026-1',
      '?month=1969-12',
      '?month=2026-12',
      '?after=x',
    ])
      expect((await get(query)).statusCode, query).toBe(400);
    expect((await get('/2026-1/events.csv')).statusCode).toBe(400);
    expect((await get('/2027-01/events.csv')).statusCode).toBe(400);
  });

  it('streams every ledger page as escaped CSV', async () => {
    const first = Array.from({ length: 1000 }, (_, index) => event(index));
    ledger.events
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([event(1000)]);
    const response = await get('/2026-11/events.csv');
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="usage-2026-11-${organizationId}.csv"`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    const rows = response.body.trimEnd().split('\r\n');
    expect(rows).toHaveLength(1002);
    expect(rows[0]).toBe(
      'created_at,event_id,request_id,project_id,project_name,source,api_key_prefix,endpoint,request_units,characters',
    );
    expect(rows[1]).toContain(`,"'=HYPERLINK(""x"")",`);
    expect(rows[2]).toContain(',"Docs, main",');
    expect(ledger.events).toHaveBeenLastCalledWith(
      organizationId,
      november,
      { createdAt: first.at(-1)!.createdAt, id: first.at(-1)!.id },
      1000,
    );
  });

  it('hides persistence failures', async () => {
    ledger.statement.mockRejectedValueOnce(new Error('secret dsn'));
    const failed = await get('');
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('secret');
  });
});

describe('csvField', () => {
  it('quotes separators and neutralizes formulas', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(12n)).toBe('12');
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('a"b')).toBe('"a""b"');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
  });
});
