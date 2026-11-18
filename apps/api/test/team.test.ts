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
import { MembersService } from '../src/modules/platform/members.service.js';
import { RolesService } from '../src/modules/platform/roles.service.js';
import {
  hashInvitationToken,
  InvitationsService,
  invitationLifetimeMs,
} from '../src/modules/platform/invitations.service.js';
import { TeamConflict } from '../src/modules/platform/team.repository.js';
import type {
  MemberSummary,
  RoleSummary,
  TeamRepository,
} from '../src/modules/platform/team.repository.js';
import type { WorkspaceRepository } from '../src/modules/platform/workspace.repository.js';
import { permissionCatalog } from '../src/modules/platform/permission-catalog.js';

const userId = randomUUID();
const otherId = randomUUID();
const organizationId = randomUUID();
const ownerRoleId = randomUUID();
const devRoleId = randomUUID();
const invitationId = randomUUID();
const origin = 'http://localhost:3000';
const email = 'Owner@Example.com';
const actor = { userId, email, requestId: expect.any(String) };
const organization = { id: organizationId, name: 'မြန်မာ', slug: 'my-team' };
const allPermissions = permissionCatalog.map(([key]) => key).sort();
const managerPermissions = [
  'member.read',
  'member.manage',
  'role.read',
  'role.manage',
  'project.read',
];

const ownerRole: RoleSummary = {
  id: ownerRoleId,
  name: 'Owner',
  slug: 'owner',
  description: null,
  system: true,
  permissions: allPermissions,
  memberCount: 1,
  invitationCount: 0,
};
const devRole: RoleSummary = {
  id: devRoleId,
  name: 'Developer',
  slug: 'developer',
  description: null,
  system: false,
  permissions: ['project.read'],
  memberCount: 0,
  invitationCount: 0,
};
const member = (id: string, role: RoleSummary): MemberSummary => ({
  userId: id,
  name: 'Member',
  email: 'member@example.com',
  role: { id: role.id, name: role.name, slug: role.slug },
  permissions: role.permissions,
  joinedAt: new Date('2026-11-01T00:00:00Z'),
});
const invitation = {
  id: invitationId,
  email: 'new@example.com',
  role: { id: devRoleId, name: 'Developer', slug: 'developer' },
  status: 'pending' as const,
  expiresAt: new Date('2026-11-25T00:00:00Z'),
  createdAt: new Date('2026-11-18T00:00:00Z'),
};

const workspace = {
  getOrganization: vi.fn(),
} as unknown as WorkspaceRepository;
const team: { [K in keyof TeamRepository]: ReturnType<typeof vi.fn> } = {
  listMembers: vi.fn(),
  findMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  transferOwnership: vi.fn(),
  listRoles: vi.fn(),
  findRole: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  deleteRole: vi.fn(),
  listInvitations: vi.fn(),
  findInvitation: vi.fn(),
  createInvitation: vi.fn(),
  rotateInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  listPendingInvitations: vi.fn(),
  acceptInvitation: vi.fn(),
};
const sendMail = vi.fn();

function actsWith(permissions: string[] | null) {
  vi.mocked(workspace.getOrganization).mockImplementation(async (_u, id) =>
    id === organizationId && permissions
      ? { ...organization, permissions }
      : null,
  );
}

describe('team management HTTP contract', () => {
  let app: NestFastifyApplication;
  const getSession = vi.fn();
  const request = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/v1/platform/${path}`,
      headers: { cookie: 'session=valid', origin, ...headers },
      ...(payload ? { payload } : {}),
    });
  const orgPath = (path: string) => `organizations/${organizationId}/${path}`;

  beforeAll(async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    app = await createApiApplication({
      apiKey: 'bootstrap-test',
      logger: false,
      rateLimitMaxRequests: 1000,
    });
    for (const service of [MembersService, RolesService, InvitationsService])
      Object.defineProperties(app.get(service), {
        repository: { value: workspace },
        team: { value: team },
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
        ? { user: { id: userId, email, emailVerified: true } }
        : null,
    );
    actsWith(allPermissions);
    team.findRole.mockImplementation(async (_org: string, id: string) =>
      id === ownerRoleId ? ownerRole : id === devRoleId ? devRole : null,
    );
    team.findMember.mockImplementation(async (_org: string, id: string) =>
      id === userId
        ? member(userId, ownerRole)
        : id === otherId
          ? member(otherId, devRole)
          : null,
    );
    sendMail.mockResolvedValue('sent');
  });

  it('requires a session, membership, and the right permission on every route', async () => {
    const routes: [
      'GET' | 'POST' | 'PATCH' | 'DELETE',
      string,
      string,
      object?,
    ][] = [
      ['GET', orgPath('members'), 'member.read'],
      [
        'PATCH',
        orgPath(`members/${otherId}`),
        'member.manage',
        { roleId: devRoleId },
      ],
      ['DELETE', orgPath(`members/${otherId}`), 'member.manage'],
      ['GET', orgPath('roles'), 'role.read'],
      ['GET', orgPath('permissions'), 'role.read'],
      [
        'POST',
        orgPath('roles'),
        'role.manage',
        { name: 'QA', slug: 'qa', permissions: [] },
      ],
      ['PATCH', orgPath(`roles/${devRoleId}`), 'role.manage', { name: 'Dev' }],
      ['DELETE', orgPath(`roles/${devRoleId}`), 'role.manage'],
      ['GET', orgPath('invitations'), 'member.read'],
      [
        'POST',
        orgPath('invitations'),
        'member.manage',
        { email: 'x@example.com', roleId: devRoleId },
      ],
      ['POST', orgPath(`invitations/${invitationId}/resend`), 'member.manage'],
      ['POST', orgPath(`invitations/${invitationId}/revoke`), 'member.manage'],
    ];
    for (const [method, path, permission, body] of routes) {
      const anonymous = await request(method, path, body, { cookie: '' });
      expect(anonymous.statusCode, `${method} ${path}`).toBe(401);
      actsWith(null);
      expect((await request(method, path, body)).statusCode).toBe(404);
      actsWith(allPermissions.filter((key) => key !== permission));
      const forbidden = await request(method, path, body);
      expect(forbidden.statusCode, `${method} ${path}`).toBe(403);
      expect(forbidden.headers['cache-control']).toBe('private, no-store');
      actsWith(allPermissions);
    }
    expect(team.updateMemberRole).not.toHaveBeenCalled();
    expect(team.createRole).not.toHaveBeenCalled();
    expect(team.createInvitation).not.toHaveBeenCalled();
  });

  it('rejects cross-origin writes before touching team state', async () => {
    const result = await request(
      'DELETE',
      orgPath(`members/${otherId}`),
      undefined,
      { origin: 'https://evil.example' },
    );
    expect(result.statusCode).toBe(403);
    expect(team.removeMember).not.toHaveBeenCalled();
  });

  it('lists members, roles and the permission catalog', async () => {
    team.listMembers.mockResolvedValue({
      items: [member(userId, ownerRole)],
      nextCursor: null,
    });
    team.listRoles.mockResolvedValue([ownerRole, devRole]);
    const members = await request('GET', orgPath('members?limit=10'));
    expect(members.statusCode).toBe(200);
    expect(members.json().items[0]).toMatchObject({ userId });
    expect(team.listMembers).toHaveBeenCalledWith(organizationId, {
      limit: 10,
    });
    const roles = await request('GET', orgPath('roles'));
    expect(roles.json().items.map((r: RoleSummary) => r.slug)).toEqual([
      'owner',
      'developer',
    ]);
    const permissions = await request('GET', orgPath('permissions'));
    expect(permissions.json().items).toHaveLength(permissionCatalog.length);
  });

  it('prevents privilege escalation through roles, members and invitations', async () => {
    actsWith(managerPermissions);
    const create = await request('POST', orgPath('roles'), {
      name: 'Billing',
      slug: 'billing',
      permissions: ['billing.manage'],
    });
    expect(create.statusCode).toBe(403);
    // Assigning or inviting into a role with permissions the actor lacks.
    team.findRole.mockResolvedValue({
      ...devRole,
      permissions: ['api_key.create'],
    });
    expect(
      (
        await request('PATCH', orgPath(`members/${otherId}`), {
          roleId: devRoleId,
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', orgPath('invitations'), {
          email: 'x@example.com',
          roleId: devRoleId,
        })
      ).statusCode,
    ).toBe(403);
    // Changing or removing a member who holds more than the actor.
    team.findRole.mockResolvedValue(devRole);
    expect(
      (
        await request('PATCH', orgPath(`members/${userId}`), {
          roleId: devRoleId,
        })
      ).statusCode,
    ).toBe(403);
    team.findMember.mockResolvedValue(member(otherId, ownerRole));
    expect(
      (await request('DELETE', orgPath(`members/${otherId}`))).statusCode,
    ).toBe(403);
    expect(team.createRole).not.toHaveBeenCalled();
    expect(team.updateMemberRole).not.toHaveBeenCalled();
    expect(team.removeMember).not.toHaveBeenCalled();
    expect(team.createInvitation).not.toHaveBeenCalled();
  });

  it('creates and updates custom roles with normalized permissions', async () => {
    team.createRole.mockResolvedValue(devRole);
    const created = await request('POST', orgPath('roles'), {
      name: ' Developer ',
      slug: 'developer',
      permissions: ['project.read', 'project.read', 'api_key.read'],
    });
    expect(created.statusCode).toBe(201);
    expect(team.createRole).toHaveBeenCalledWith(
      organizationId,
      {
        name: 'Developer',
        slug: 'developer',
        description: null,
        permissions: ['api_key.read', 'project.read'],
      },
      actor,
    );
    for (const body of [
      { name: 'X', slug: 'owner', permissions: [] },
      { name: 'X', slug: 'x', permissions: ['not.a.permission'] },
      { name: 'X', slug: 'X Y', permissions: [] },
    ])
      expect((await request('POST', orgPath('roles'), body)).statusCode).toBe(
        400,
      );
    expect(
      (await request('PATCH', orgPath(`roles/${devRoleId}`), {})).statusCode,
    ).toBe(400);
    team.updateRole.mockResolvedValue({ ...devRole, name: 'Dev' });
    const updated = await request('PATCH', orgPath(`roles/${devRoleId}`), {
      name: 'Dev',
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().name).toBe('Dev');
  });

  it('protects system roles and roles in use', async () => {
    for (const [method, body] of [
      ['PATCH', { name: 'Boss' }],
      ['DELETE', undefined],
    ] as const) {
      const result = await request(
        method,
        orgPath(`roles/${ownerRoleId}`),
        body,
      );
      expect(result.statusCode).toBe(409);
      expect(result.json()).toMatchObject({ code: 'conflict' });
    }
    expect(team.updateRole).not.toHaveBeenCalled();
    team.deleteRole.mockRejectedValue(new TeamConflict('Role is in use.'));
    expect(
      (await request('DELETE', orgPath(`roles/${devRoleId}`))).statusCode,
    ).toBe(409);
    team.deleteRole.mockResolvedValue(true);
    expect(
      (await request('DELETE', orgPath(`roles/${devRoleId}`))).statusCode,
    ).toBe(204);
    expect(
      (await request('DELETE', orgPath(`roles/${randomUUID()}`))).statusCode,
    ).toBe(404);
  });

  it('maps the last-manager guard to 409 and lets members leave', async () => {
    team.updateMemberRole.mockRejectedValue(
      new TeamConflict('At least one member must keep management.'),
    );
    const demote = await request('PATCH', orgPath(`members/${userId}`), {
      roleId: devRoleId,
    });
    expect(demote.statusCode).toBe(409);
    expect(demote.json().detail).toContain('At least one member');
    // Leaving needs membership only, not member.manage.
    actsWith(['project.read']);
    team.removeMember.mockResolvedValue(true);
    expect(
      (await request('DELETE', orgPath(`members/${userId}`))).statusCode,
    ).toBe(204);
    expect(team.removeMember).toHaveBeenCalledWith(
      organizationId,
      userId,
      actor,
    );
    team.removeMember.mockRejectedValue(new TeamConflict('last manager'));
    expect(
      (await request('DELETE', orgPath(`members/${userId}`))).statusCode,
    ).toBe(409);
    expect(
      (await request('DELETE', orgPath(`members/${otherId}`))).statusCode,
    ).toBe(403);
  });

  it('creates invitations with a hashed single-use token and best-effort email', async () => {
    team.createInvitation.mockResolvedValue(invitation);
    const before = Date.now();
    const result = await request('POST', orgPath('invitations'), {
      email: 'New@Example.com',
      roleId: devRoleId,
    });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({
      id: invitationId,
      emailDelivery: 'sent',
    });
    expect(JSON.stringify(result.json())).not.toMatch(/token/i);
    const [, record] = team.createInvitation.mock.calls[0]!;
    expect(record).toMatchObject({
      email: 'new@example.com',
      roleId: devRoleId,
      invitedByUserId: userId,
    });
    expect(record.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      invitationLifetimeMs - 1000,
    );
    const message = sendMail.mock.calls[0]![0];
    expect(message.to).toBe('new@example.com');
    expect(message.text).not.toContain('Developer');
    const token = new URL(
      /https?:\/\/\S+/.exec(message.text)![0],
    ).searchParams.get('token')!;
    expect(new URL(/https?:\/\/\S+/.exec(message.text)![0]).origin).toBe(
      origin,
    );
    expect(hashInvitationToken(token)).toBe(record.tokenHash);

    sendMail.mockResolvedValue('failed');
    const failed = await request('POST', orgPath('invitations'), {
      email: 'other@example.com',
      roleId: devRoleId,
    });
    expect(failed.statusCode).toBe(201);
    expect(failed.json().emailDelivery).toBe('failed');

    team.createInvitation.mockRejectedValue(
      new TeamConflict('An open invitation already exists.'),
    );
    expect(
      (
        await request('POST', orgPath('invitations'), {
          email: 'new@example.com',
          roleId: devRoleId,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await request('POST', orgPath('invitations'), {
          email: 'not-an-email',
          roleId: devRoleId,
        })
      ).statusCode,
    ).toBe(400);
  });

  it('rotates tokens on resend and revokes idempotently', async () => {
    team.findInvitation.mockResolvedValue(invitation);
    team.rotateInvitation.mockResolvedValue(invitation);
    const resent = await request(
      'POST',
      orgPath(`invitations/${invitationId}/resend`),
    );
    expect(resent.statusCode).toBe(200);
    const [, , tokenHash] = team.rotateInvitation.mock.calls[0]!;
    const link = /https?:\/\/\S+/.exec(sendMail.mock.calls[0]![0].text)![0];
    expect(hashInvitationToken(new URL(link).searchParams.get('token')!)).toBe(
      tokenHash,
    );
    team.findInvitation.mockResolvedValue({
      ...invitation,
      status: 'accepted',
    });
    expect(
      (await request('POST', orgPath(`invitations/${invitationId}/resend`)))
        .statusCode,
    ).toBe(404);
    team.revokeInvitation.mockResolvedValue({
      ...invitation,
      status: 'revoked',
    });
    const revoked = await request(
      'POST',
      orgPath(`invitations/${invitationId}/revoke`),
    );
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().status).toBe('revoked');
    team.revokeInvitation.mockResolvedValue(null);
    expect(
      (await request('POST', orgPath(`invitations/${invitationId}/revoke`)))
        .statusCode,
    ).toBe(404);
  });

  it('lists and accepts invitations for the session email only', async () => {
    team.listPendingInvitations.mockResolvedValue([]);
    const pending = await request('GET', 'invitations');
    expect(pending.statusCode).toBe(200);
    expect(team.listPendingInvitations).toHaveBeenCalledWith(
      'owner@example.com',
      expect.any(Date),
    );
    const token = 'a'.repeat(43);
    const cases = [
      [{ status: 'accepted', organization }, 200],
      [{ status: 'already_member', organization }, 200],
      [{ status: 'gone' }, 410],
      [{ status: 'not_found' }, 404],
      [{ status: 'email_mismatch' }, 403],
    ] as const;
    for (const [outcome, status] of cases) {
      team.acceptInvitation.mockResolvedValueOnce(outcome);
      const result = await request('POST', 'invitations/accept', { token });
      expect(result.statusCode, outcome.status).toBe(status);
    }
    expect(team.acceptInvitation).toHaveBeenLastCalledWith(
      { tokenHash: hashInvitationToken(token) },
      { ...actor, email: 'owner@example.com' },
      expect.any(Date),
    );
    // Someone else's invitation id is indistinguishable from a missing one.
    team.acceptInvitation.mockResolvedValueOnce({ status: 'email_mismatch' });
    expect(
      (await request('POST', 'invitations/accept', { invitationId }))
        .statusCode,
    ).toBe(404);
    team.acceptInvitation.mockResolvedValueOnce({ status: 'gone' });
    const gone = await request('POST', 'invitations/accept', { invitationId });
    expect(gone.json()).toMatchObject({ title: 'Gone', code: 'gone' });
    for (const body of [{}, { token: 'short' }, { token, invitationId }])
      expect(
        (await request('POST', 'invitations/accept', body)).statusCode,
      ).toBe(400);
    expect(
      (await request('POST', 'invitations/accept', { token }, { cookie: '' }))
        .statusCode,
    ).toBe(401);
  });
});
