import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaWorkspaceRepository } from '../src/infrastructure/database/prisma-workspace.repository.js';
import { PrismaTeamRepository } from '../src/infrastructure/database/prisma-team.repository.js';
import { TeamConflict } from '../src/modules/platform/team.repository.js';
import { hashInvitationToken } from '../src/modules/platform/invitations.service.js';

const databaseURL = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseURL)('team management on PostgreSQL', () => {
  let prisma: PrismaClient;
  let workspace: PrismaWorkspaceRepository;
  let team: PrismaTeamRepository;
  const suffix = randomUUID().slice(0, 8);
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  const createUser = async (label: string) => {
    const user = await prisma.user.create({
      data: {
        name: label,
        email: `team-${label}-${suffix}@example.com`,
        emailVerified: true,
      },
    });
    userIds.push(user.id);
    return user;
  };
  const createOrganization = async (ownerId: string, label: string) => {
    const organization = await workspace.createOrganization(ownerId, {
      name: label,
      slug: `team-${label}-${suffix}`,
    });
    organizationIds.push(organization.id);
    const owner = (await team.listRoles(organization.id))[0]!;
    return { organization, owner };
  };

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseURL! }),
    });
    workspace = new PrismaWorkspaceRepository(databaseURL!);
    team = new PrismaTeamRepository(databaseURL!);
  });
  afterAll(async () => {
    await prisma?.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma?.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma?.$disconnect();
    await workspace?.onApplicationShutdown();
    await team?.onApplicationShutdown();
  });

  it('creates a system owner role and keeps custom roles tenant-scoped', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const { organization, owner } = await createOrganization(alice.id, 'a');
    const other = await createOrganization(bob.id, 'b');
    expect(owner).toMatchObject({
      slug: 'owner',
      system: true,
      memberCount: 1,
    });
    expect(owner.permissions).toContain('role.manage');

    const developer = await team.createRole(organization.id, {
      name: 'Developer',
      slug: 'developer',
      description: null,
      permissions: ['project.read', 'api_key.read'],
    });
    expect(developer.permissions).toEqual(['api_key.read', 'project.read']);
    await expect(
      team.createRole(organization.id, {
        name: 'Dup',
        slug: 'developer',
        description: null,
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(TeamConflict);
    await expect(
      team.updateRole(organization.id, owner.id, { name: 'Boss' }),
    ).rejects.toBeInstanceOf(TeamConflict);
    // A role from another organization is invisible and cannot be assigned.
    expect(await team.findRole(other.organization.id, developer.id)).toBeNull();
    await expect(
      team.updateMemberRole(other.organization.id, bob.id, developer.id),
    ).rejects.toThrow();
    expect(
      (await team.findMember(other.organization.id, bob.id))?.role.slug,
    ).toBe('owner');
  });

  it('issues, rotates, revokes and accepts single-use invitations', async () => {
    const owner = await createUser('inviter');
    const invitee = await createUser('invitee');
    const stranger = await createUser('stranger');
    const { organization } = await createOrganization(owner.id, 'invites');
    const role = await team.createRole(organization.id, {
      name: 'Viewer',
      slug: 'viewer',
      description: null,
      permissions: ['project.read'],
    });
    const now = new Date();
    const later = new Date(now.getTime() + 60_000);
    const record = (token: string, expiresAt = later) => ({
      email: invitee.email.toLowerCase(),
      roleId: role.id,
      tokenHash: hashInvitationToken(token),
      invitedByUserId: owner.id,
      expiresAt,
    });

    // Expired open invitations do not block a new one.
    const expired = await team.createInvitation(
      organization.id,
      record(`expired-${suffix}`, new Date(now.getTime() - 1000)),
      new Date(now.getTime() - 2000),
    );
    const invitation = await team.createInvitation(
      organization.id,
      record(`first-${suffix}`),
      now,
    );
    expect(invitation.status).toBe('pending');
    expect(
      (await team.findInvitation(organization.id, expired.id, now))?.status,
    ).toBe('revoked');
    await expect(
      team.createInvitation(organization.id, record(`dup-${suffix}`), now),
    ).rejects.toBeInstanceOf(TeamConflict);
    await expect(
      team.createInvitation(
        organization.id,
        { ...record(`member-${suffix}`), email: owner.email.toUpperCase() },
        now,
      ),
    ).rejects.toBeInstanceOf(TeamConflict);
    expect(
      (await team.findRole(organization.id, role.id))?.invitationCount,
    ).toBe(1);
    await expect(
      team.deleteRole(organization.id, role.id),
    ).rejects.toBeInstanceOf(TeamConflict);

    // Rotation invalidates the previous token.
    await team.rotateInvitation(
      organization.id,
      invitation.id,
      hashInvitationToken(`second-${suffix}`),
      later,
      now,
    );
    expect(
      await team.acceptInvitation(
        { tokenHash: hashInvitationToken(`first-${suffix}`) },
        invitee.id,
        invitee.email,
        now,
      ),
    ).toEqual({ status: 'not_found' });
    expect(
      (await team.listPendingInvitations(invitee.email, now)).map((i) => i.id),
    ).toEqual([invitation.id]);
    expect(
      await team.acceptInvitation(
        { tokenHash: hashInvitationToken(`second-${suffix}`) },
        stranger.id,
        stranger.email,
        now,
      ),
    ).toEqual({ status: 'email_mismatch' });
    expect(
      await team.acceptInvitation(
        { invitationId: invitation.id },
        invitee.id,
        invitee.email,
        now,
      ),
    ).toMatchObject({ status: 'accepted' });
    expect(
      (await team.findMember(organization.id, invitee.id))?.role.slug,
    ).toBe('viewer');
    expect(
      await team.acceptInvitation(
        { tokenHash: hashInvitationToken(`second-${suffix}`) },
        invitee.id,
        invitee.email,
        now,
      ),
    ).toMatchObject({ status: 'already_member' });
    expect(await team.listPendingInvitations(invitee.email, now)).toEqual([]);

    // A revoked invitation is gone for its addressee.
    const strangerInvite = await team.createInvitation(
      organization.id,
      { ...record(`stranger-${suffix}`), email: stranger.email },
      now,
    );
    expect(
      (await team.revokeInvitation(organization.id, strangerInvite.id, now))
        ?.status,
    ).toBe('revoked');
    expect(
      await team.acceptInvitation(
        { tokenHash: hashInvitationToken(`stranger-${suffix}`) },
        stranger.id,
        stranger.email,
        now,
      ),
    ).toEqual({ status: 'gone' });

    // Reassigning the member frees the role for deletion.
    const owners = await team.listRoles(organization.id);
    await team.updateMemberRole(
      organization.id,
      invitee.id,
      owners.find((r) => r.system)!.id,
    );
    expect(await team.deleteRole(organization.id, role.id)).toBe(true);
  });

  it('never leaves an organization without a member manager, even concurrently', async () => {
    const first = await createUser('first');
    const second = await createUser('second');
    const { organization, owner } = await createOrganization(first.id, 'guard');
    const viewer = await team.createRole(organization.id, {
      name: 'Viewer',
      slug: 'viewer',
      description: null,
      permissions: ['project.read'],
    });
    await expect(
      team.updateMemberRole(organization.id, first.id, viewer.id),
    ).rejects.toBeInstanceOf(TeamConflict);
    await expect(
      team.removeMember(organization.id, first.id),
    ).rejects.toBeInstanceOf(TeamConflict);

    await prisma.organizationMember.create({
      data: {
        organizationId: organization.id,
        userId: second.id,
        roleId: owner.id,
      },
    });
    const results = await Promise.allSettled([
      team.updateMemberRole(organization.id, first.id, viewer.id),
      team.updateMemberRole(organization.id, second.id, viewer.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
      TeamConflict,
    );

    // Removing management permissions from the only manager's custom role.
    const manager = await team.createRole(organization.id, {
      name: 'Manager',
      slug: 'manager',
      description: null,
      permissions: ['member.manage', 'role.manage'],
    });
    const remaining = (
      await team.listMembers(organization.id, { limit: 10 })
    ).items.find((m) => m.role.slug === 'owner')!;
    await team.updateMemberRole(organization.id, remaining.userId, manager.id);
    await expect(
      team.updateRole(organization.id, manager.id, {
        permissions: ['member.manage'],
      }),
    ).rejects.toBeInstanceOf(TeamConflict);
    expect(
      (await team.findRole(organization.id, manager.id))?.permissions,
    ).toEqual(['member.manage', 'role.manage']);
  });
});
