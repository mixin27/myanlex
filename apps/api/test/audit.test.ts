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
import { AuditService } from '../src/modules/platform/audit.service.js';
import { OwnershipService } from '../src/modules/platform/ownership.service.js';
import { encodeAuditCursor } from '../src/modules/platform/audit.schemas.js';
import type {
  AuditEventSummary,
  AuditRepository,
} from '../src/modules/platform/audit.js';
import { TeamConflict } from '../src/modules/platform/team.repository.js';
import type {
  MemberSummary,
  TeamRepository,
} from '../src/modules/platform/team.repository.js';
import type { WorkspaceRepository } from '../src/modules/platform/workspace.repository.js';
import { permissionCatalog } from '../src/modules/platform/permission-catalog.js';

const userId = randomUUID();
const otherId = randomUUID();
const organizationId = randomUUID();
const roleId = randomUUID();
const origin = 'http://localhost:3000';
const email = 'owner@example.com';
const organization = { id: organizationId, name: 'Acme', slug: 'acme' };
const allPermissions = permissionCatalog.map(([key]) => key).sort();
const actor = { userId, email, requestId: expect.any(String) };

const member = (id: string, name: string): MemberSummary => ({
  userId: id,
  name,
  email: `${name.toLowerCase()}@example.com`,
  role: { id: roleId, name, slug: name.toLowerCase() },
  permissions: [],
  joinedAt: new Date('2026-11-01T00:00:00Z'),
});
const event = (id: string, createdAt: string): AuditEventSummary => ({
  id,
  action: 'member.role_changed',
  actor: { userId, email },
  target: { type: 'member', id: otherId },
  metadata: { email: 'dev@example.com' },
  requestId: 'req-1',
  createdAt: new Date(createdAt),
});

const workspace = { getOrganization: vi.fn() };
const team = { transferOwnership: vi.fn() };
const audit: { [K in keyof AuditRepository]: ReturnType<typeof vi.fn> } = {
  list: vi.fn(),
  cleanup: vi.fn(),
};

function actsWith(permissions: string[] | null) {
  workspace.getOrganization.mockImplementation(
    async (_u: string, id: string) =>
      id === organizationId && permissions
        ? { ...organization, permissions }
        : null,
  );
}

describe('audit log and ownership transfer HTTP contract', () => {
  let app: NestFastifyApplication;
  const getSession = vi.fn();
  const request = (
    method: 'GET' | 'POST',
    path: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/v1/platform/organizations/${organizationId}/${path}`,
      headers: { cookie: 'session=valid', origin, ...headers },
      ...(payload ? { payload } : {}),
    });
  const transfer = (body: object, headers?: Record<string, string>) =>
    request('POST', 'ownership-transfer', body, headers);
  const validTransfer = {
    toUserId: otherId,
    newRoleId: roleId,
    confirmSlug: 'acme',
  };

  beforeAll(async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    app = await createApiApplication({
      apiKey: 'bootstrap-test',
      logger: false,
      rateLimitMaxRequests: 1000,
    });
    Object.defineProperties(app.get(AuditService), {
      repository: { value: workspace as unknown as WorkspaceRepository },
      audit: { value: audit },
    });
    Object.defineProperties(app.get(OwnershipService), {
      repository: { value: workspace as unknown as WorkspaceRepository },
      team: { value: team as unknown as TeamRepository },
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
        ? { user: { id: userId, email, emailVerified: true } }
        : null,
    );
    actsWith(allPermissions);
    audit.list.mockResolvedValue({ items: [], hasMore: false });
  });

  it('requires a session, membership and audit.read to list events', async () => {
    expect(
      (await request('GET', 'audit-events', undefined, { cookie: '' }))
        .statusCode,
    ).toBe(401);
    actsWith(null);
    expect((await request('GET', 'audit-events')).statusCode).toBe(404);
    actsWith(allPermissions.filter((key) => key !== 'audit.read'));
    const forbidden = await request('GET', 'audit-events');
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.headers['cache-control']).toBe('private, no-store');
    expect(audit.list).not.toHaveBeenCalled();
  });

  it('pages newest first with an opaque cursor and validates filters', async () => {
    const first = event(randomUUID(), '2026-11-19T10:00:00.000Z');
    const second = event(randomUUID(), '2026-11-19T09:00:00.000Z');
    audit.list.mockResolvedValueOnce({ items: [first, second], hasMore: true });
    const page = await request('GET', 'audit-events?limit=2');
    expect(page.statusCode).toBe(200);
    const body = page.json<{ items: { id: string }[]; nextCursor: string }>();
    expect(body.items.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(body.nextCursor).toBe(encodeAuditCursor(second));
    expect(audit.list).toHaveBeenLastCalledWith(organizationId, { limit: 2 });

    const next = await request(
      'GET',
      `audit-events?cursor=${body.nextCursor}&action=member.role_changed`,
    );
    expect(next.statusCode).toBe(200);
    expect(next.json()).toEqual({ items: [], nextCursor: null });
    expect(audit.list).toHaveBeenLastCalledWith(organizationId, {
      limit: 50,
      action: 'member.role_changed',
      cursor: { createdAt: second.createdAt, id: second.id },
    });

    for (const query of [
      'cursor=not-a-cursor',
      `cursor=${Buffer.from('2026-11-19|not-uuid').toString('base64url')}`,
      'action=member.deleted',
      'limit=101',
      'after=x',
    ])
      expect(
        (await request('GET', `audit-events?${query}`)).statusCode,
        query,
      ).toBe(400);
  });

  it('transfers ownership only with membership, a matching slug and another member', async () => {
    expect((await transfer(validTransfer, { cookie: '' })).statusCode).toBe(
      401,
    );
    expect(
      (await transfer(validTransfer, { origin: 'https://evil.example' }))
        .statusCode,
    ).toBe(403);
    actsWith(null);
    expect((await transfer(validTransfer)).statusCode).toBe(404);
    actsWith(allPermissions);
    expect(
      (await transfer({ ...validTransfer, confirmSlug: 'ACME' })).statusCode,
    ).toBe(400);
    expect(
      (await transfer({ ...validTransfer, toUserId: userId })).statusCode,
    ).toBe(400);
    expect((await transfer({ toUserId: otherId })).statusCode).toBe(400);
    expect(team.transferOwnership).not.toHaveBeenCalled();
  });

  it('maps repository outcomes to problem responses', async () => {
    const owner = member(otherId, 'Dana');
    const previous = member(userId, 'Olivia');
    team.transferOwnership.mockResolvedValueOnce({
      status: 'transferred',
      owner,
      previous,
    });
    const done = await transfer(validTransfer);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({
      owner: { userId: otherId },
      previousOwner: { userId },
    });
    expect(team.transferOwnership).toHaveBeenCalledWith(
      organizationId,
      otherId,
      roleId,
      actor,
    );
    for (const [status, code] of [
      ['not_owner', 403],
      ['target_not_found', 404],
      ['already_owner', 409],
      ['role_not_found', 404],
      ['system_role', 400],
    ] as const) {
      team.transferOwnership.mockResolvedValueOnce({ status });
      expect((await transfer(validTransfer)).statusCode, status).toBe(code);
    }
    team.transferOwnership.mockRejectedValueOnce(
      new TeamConflict('last manager'),
    );
    expect((await transfer(validTransfer)).statusCode).toBe(409);
  });
});
