import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaWorkspaceRepository } from '../src/infrastructure/database/prisma-workspace.repository.js';
import { PrismaTeamRepository } from '../src/infrastructure/database/prisma-team.repository.js';
import { PrismaAuditRepository } from '../src/infrastructure/database/prisma-audit.repository.js';
import { TeamConflict } from '../src/modules/platform/team.repository.js';
import { hashInvitationToken } from '../src/modules/platform/invitations.service.js';
import { asActor } from './actor.js';

const databaseURL = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseURL)('audit log on PostgreSQL', () => {
  let prisma: PrismaClient;
  let workspace: PrismaWorkspaceRepository;
  let team: PrismaTeamRepository;
  let audit: PrismaAuditRepository;
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  const createUser = async (label: string) => {
    const user = await prisma.user.create({
      data: {
        name: label,
        email: `audit-${label}-${suffix}@example.com`,
        emailVerified: true,
      },
    });
    userIds.push(user.id);
    return user;
  };
  const setup = async (label: string) => {
    const owner = await createUser(`${label}-owner`);
    const organization = await workspace.createOrganization(asActor(owner), {
      name: label,
      slug: `audit-${label}-${suffix}`,
    });
    organizationIds.push(organization.id);
    const ownerRole = (await team.listRoles(organization.id))[0]!;
    return { owner, organization, ownerRole };
  };
  const events = (organizationId: string) =>
    prisma.auditEvent.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  const actions = async (organizationId: string) =>
    (await events(organizationId)).map((event) => event.action);

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseURL! }),
    });
    workspace = new PrismaWorkspaceRepository(databaseURL!);
    team = new PrismaTeamRepository(databaseURL!);
    audit = new PrismaAuditRepository(databaseURL!);
  });
  afterAll(async () => {
    await prisma?.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma?.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma?.$disconnect();
    for (const repository of [workspace, team, audit])
      await repository?.onApplicationShutdown();
  });

  it('records each committed change once, without secrets, and nothing for no-ops', async () => {
    const { owner, organization, ownerRole } = await setup('writes');
    expect(ownerRole.permissions).toContain('audit.read');
    const actor = { ...asActor(owner), requestId: 'req-audit-1' };
    const orgId = organization.id;

    const project = await workspace.createProject(
      orgId,
      { name: 'API', slug: 'api', environment: 'development' },
      actor,
    );
    await workspace.updateProject(orgId, project.id, { name: 'API' }, actor);
    await workspace.updateProject(
      orgId,
      project.id,
      { name: 'Server', environment: 'production' },
      actor,
    );
    const key = await workspace.createApiKey(
      orgId,
      project.id,
      {
        name: 'Server',
        prefix: 'mylx_abcdefgh',
        keyHash: 'f'.repeat(64),
        scopes: ['api.invoke'],
        expiresAt: null,
      },
      actor,
    );
    await workspace.revokeApiKey(orgId, project.id, key.id, new Date(), actor);
    await workspace.revokeApiKey(orgId, project.id, key.id, new Date(), actor);

    const role = await team.createRole(
      orgId,
      {
        name: 'Developer',
        slug: 'developer',
        description: null,
        permissions: ['project.read'],
      },
      actor,
    );
    await team.updateRole(orgId, role.id, { name: 'Developer' }, actor);
    await team.updateRole(
      orgId,
      role.id,
      { permissions: ['api_key.read', 'usage.read'] },
      actor,
    );

    const now = new Date();
    const invitee = await createUser('invitee');
    const invitation = await team.createInvitation(
      orgId,
      {
        email: invitee.email,
        roleId: role.id,
        tokenHash: hashInvitationToken(`first-${suffix}`),
        invitedByUserId: owner.id,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      now,
      actor,
    );
    await team.rotateInvitation(
      orgId,
      invitation.id,
      hashInvitationToken(`second-${suffix}`),
      new Date(now.getTime() + 60_000),
      now,
      actor,
    );
    await team.acceptInvitation(
      { tokenHash: hashInvitationToken(`second-${suffix}`) },
      asActor(invitee),
      now,
    );
    // Closed invitations are idempotent to revoke and not recorded again.
    await team.revokeInvitation(orgId, invitation.id, now, actor);
    await team.updateMemberRole(orgId, invitee.id, role.id, actor);
    await team.updateMemberRole(orgId, invitee.id, ownerRole.id, actor);
    await team.updateMemberRole(orgId, invitee.id, role.id, actor);
    await team.removeMember(orgId, invitee.id, actor);
    await team.deleteRole(orgId, role.id, actor);

    expect(await actions(orgId)).toEqual([
      'organization.created',
      'project.created',
      'project.updated',
      'api_key.created',
      'api_key.revoked',
      'role.created',
      'role.updated',
      'invitation.created',
      'invitation.resent',
      'invitation.accepted',
      'member.role_changed',
      'member.role_changed',
      'member.removed',
      'role.deleted',
    ]);
    const recorded = await events(orgId);
    const byAction = (action: string) =>
      recorded.filter((event) => event.action === action);
    expect(byAction('project.updated')[0]!.metadata).toEqual({
      name: 'Server',
      changes: {
        name: ['API', 'Server'],
        environment: ['development', 'production'],
      },
    });
    expect(byAction('role.updated')[0]!.metadata).toEqual({
      name: 'Developer',
      changes: {},
      permissionsAdded: ['api_key.read', 'usage.read'],
      permissionsRemoved: ['project.read'],
    });
    expect(byAction('member.role_changed')[0]!.metadata).toMatchObject({
      email: invitee.email,
      from: { name: 'Developer' },
      to: { name: 'Owner' },
    });
    const accepted = byAction('invitation.accepted')[0]!;
    expect(accepted.actorUserId).toBe(invitee.id);
    expect(accepted.actorEmail).toBe(invitee.email);
    expect(byAction('api_key.created')[0]).toMatchObject({
      actorUserId: owner.id,
      actorEmail: owner.email,
      requestId: 'req-audit-1',
      targetType: 'api_key',
      targetId: key.id,
    });
    const serialized = JSON.stringify(recorded);
    expect(serialized).not.toContain('f'.repeat(64));
    expect(serialized).not.toContain(hashInvitationToken(`second-${suffix}`));
    expect(serialized).not.toContain(`second-${suffix}`);

    // Reads are newest first and page with the (createdAt, id) keyset.
    const pages: string[] = [];
    let cursor: { createdAt: Date; id: string } | undefined;
    for (;;) {
      const page = await audit.list(orgId, { limit: 4, cursor });
      pages.push(...page.items.map((item) => item.action));
      if (!page.hasMore) break;
      const last = page.items.at(-1)!;
      cursor = { createdAt: last.createdAt, id: last.id };
    }
    expect(pages).toEqual([...(await actions(orgId))].reverse());
    expect(
      (await audit.list(orgId, { limit: 10, action: 'member.role_changed' }))
        .items,
    ).toHaveLength(2);
  });

  it('writes nothing when the change rolls back', async () => {
    const { owner, organization, ownerRole } = await setup('rollback');
    const actor = asActor(owner);
    const viewer = await team.createRole(
      organization.id,
      {
        name: 'Viewer',
        slug: 'viewer',
        description: null,
        permissions: ['project.read'],
      },
      actor,
    );
    const before = (await events(organization.id)).length;
    await expect(
      team.updateMemberRole(organization.id, owner.id, viewer.id, actor),
    ).rejects.toBeInstanceOf(TeamConflict);
    await expect(
      team.removeMember(organization.id, owner.id, actor),
    ).rejects.toBeInstanceOf(TeamConflict);
    await expect(
      team.createRole(
        organization.id,
        { name: 'Dup', slug: 'viewer', description: null, permissions: [] },
        actor,
      ),
    ).rejects.toBeInstanceOf(TeamConflict);
    await expect(
      team.updateRole(organization.id, ownerRole.id, { name: 'Boss' }, actor),
    ).rejects.toBeInstanceOf(TeamConflict);
    expect((await events(organization.id)).length).toBe(before);
  });

  it('transfers ownership atomically and records it', async () => {
    const { owner, organization, ownerRole } = await setup('transfer');
    const actor = asActor(owner);
    const dana = await createUser('dana');
    const quinn = await createUser('quinn');
    const developer = await team.createRole(
      organization.id,
      {
        name: 'Developer',
        slug: 'developer',
        description: null,
        permissions: ['project.read'],
      },
      actor,
    );
    for (const user of [dana, quinn])
      await prisma.organizationMember.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          roleId: developer.id,
        },
      });

    expect(
      await team.transferOwnership(
        organization.id,
        dana.id,
        ownerRole.id,
        actor,
      ),
    ).toEqual({ status: 'system_role' });
    expect(
      await team.transferOwnership(
        organization.id,
        randomUUID(),
        developer.id,
        actor,
      ),
    ).toEqual({ status: 'target_not_found' });
    expect(
      await team.transferOwnership(
        organization.id,
        quinn.id,
        developer.id,
        asActor(dana),
      ),
    ).toEqual({ status: 'not_owner' });

    // Two concurrent transfers by the same Owner: exactly one succeeds.
    const results = await Promise.all([
      team.transferOwnership(organization.id, dana.id, developer.id, actor),
      team.transferOwnership(organization.id, quinn.id, developer.id, actor),
    ]);
    expect(
      results.filter((result) => result.status === 'transferred'),
    ).toHaveLength(1);
    expect(results.map((result) => result.status)).toContain('not_owner');
    const winner = results.find((result) => result.status === 'transferred')!;
    if (winner.status !== 'transferred') throw new Error('unreachable');
    expect(winner.previous).toMatchObject({
      userId: owner.id,
      role: { slug: 'developer' },
    });
    const owners = (
      await team.listMembers(organization.id, { limit: 10 })
    ).items.filter((member) => member.role.slug === 'owner');
    expect(owners.map((member) => member.userId)).toEqual([
      winner.owner.userId,
    ]);
    const transferred = (await events(organization.id)).filter(
      (event) => event.action === 'ownership.transferred',
    );
    expect(transferred).toHaveLength(1);
    expect(transferred[0]).toMatchObject({
      actorUserId: owner.id,
      targetId: winner.owner.userId,
      metadata: {
        email: winner.owner.email,
        previousOwnerRole: { id: developer.id, name: 'Developer' },
      },
    });
    expect(
      await team.transferOwnership(
        organization.id,
        winner.owner.userId,
        developer.id,
        actor,
      ),
    ).toEqual({ status: 'not_owner' });
  });

  it('keeps rows append-only, survives actor deletion, and cleans up by age', async () => {
    const { owner, organization } = await setup('retention');
    const [created] = await events(organization.id);
    await expect(
      prisma.auditEvent.update({
        where: { id: created!.id },
        data: { action: 'project.created' },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE audit_events SET metadata = '{}' WHERE id = ${created!.id}::uuid`,
    ).rejects.toThrow();

    // Deleting the actor keeps the event with its email snapshot.
    const member = await createUser('leaver');
    const leaverOrg = await workspace.createOrganization(asActor(member), {
      name: 'Leaver',
      slug: `audit-leaver-${suffix}`,
    });
    organizationIds.push(leaverOrg.id);
    await prisma.user.delete({ where: { id: member.id } });
    expect((await events(leaverOrg.id))[0]).toMatchObject({
      actorUserId: null,
      actorEmail: member.email,
    });

    await prisma.$executeRaw`ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update`;
    try {
      await prisma.$executeRaw`UPDATE audit_events SET created_at = now() - interval '400 days' WHERE id = ${created!.id}::uuid`;
    } finally {
      await prisma.$executeRaw`ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update`;
    }
    await workspace.createProject(
      organization.id,
      { name: 'Fresh', slug: 'fresh', environment: 'development' },
      asActor(owner),
    );
    const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    let deleted = 0;
    for (let count = -1; count !== 0;) {
      count = await audit.cleanup(cutoff);
      deleted += count;
    }
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await actions(organization.id)).toEqual(['project.created']);
  });
});
