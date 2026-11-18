import { PrismaPg } from '@prisma/adapter-pg';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { ListQuery } from '../../modules/platform/platform.schemas.js';
import type {
  RoleInput,
  RoleUpdateInput,
} from '../../modules/platform/team.schemas.js';
import {
  managementPermissions,
  TeamConflict,
} from '../../modules/platform/team.repository.js';
import type { AuditActor } from '../../modules/platform/audit.js';
import { difference, recordAudit } from './audit-writer.js';
import type {
  AcceptResult,
  InvitationLookup,
  InvitationRecord,
  InvitationStatus,
  InvitationSummary,
  MemberSummary,
  PendingInvitation,
  RoleSummary,
  TeamRepository,
  TransferResult,
} from '../../modules/platform/team.repository.js';

type Tx = Prisma.TransactionClient;

const roleReference = { id: true, name: true, slug: true } as const;
const permissionKeys = {
  select: { permission: { select: { key: true } } },
} as const;
const openInvitation = { acceptedAt: null, revokedAt: null } as const;

const memberSelect = {
  userId: true,
  createdAt: true,
  user: { select: { name: true, email: true } },
  role: { select: { ...roleReference, permissions: permissionKeys } },
} as const;
function summarizeMember(
  member: Prisma.OrganizationMemberGetPayload<{ select: typeof memberSelect }>,
): MemberSummary {
  const { permissions, ...role } = member.role;
  return {
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role,
    permissions: permissions.map((grant) => grant.permission.key).sort(),
    joinedAt: member.createdAt,
  };
}

const roleSelect = {
  ...roleReference,
  description: true,
  system: true,
  permissions: permissionKeys,
  _count: {
    select: {
      members: true,
      invitations: { where: openInvitation },
    },
  },
} as const;
function summarizeRole(
  role: Prisma.RoleGetPayload<{ select: typeof roleSelect }>,
): RoleSummary {
  const { permissions, _count, ...rest } = role;
  return {
    ...rest,
    permissions: permissions.map((grant) => grant.permission.key).sort(),
    memberCount: _count.members,
    invitationCount: _count.invitations,
  };
}

const invitationSelect = {
  id: true,
  email: true,
  expiresAt: true,
  createdAt: true,
  acceptedAt: true,
  revokedAt: true,
  role: { select: roleReference },
} as const;
function invitationStatus(
  invitation: {
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
  },
  now: Date,
): InvitationStatus {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  return invitation.expiresAt.getTime() <= now.getTime()
    ? 'expired'
    : 'pending';
}
function summarizeInvitation(
  invitation: Prisma.OrganizationInvitationGetPayload<{
    select: typeof invitationSelect;
  }>,
  now: Date,
): InvitationSummary {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    status: invitationStatus(invitation, now),
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
  };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
async function conflictOnUnique<T>(
  operation: () => Promise<T>,
  message: string,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueViolation(error)) throw new TeamConflict(message);
    throw error;
  }
}

/**
 * Serializes team changes per organization. Every mutation that can reduce
 * management capability takes this row lock before writing, then verifies the
 * invariant before commit, so concurrent demotions cannot both succeed.
 */
async function lockOrganization(tx: Tx, organizationId: string) {
  await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${organizationId}::uuid FOR UPDATE`;
}
async function assertManageable(tx: Tx, organizationId: string) {
  const [first, second] = managementPermissions;
  const rows = await tx.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM organization_members m
    WHERE m.organization_id = ${organizationId}::uuid AND (
      SELECT count(DISTINCT p.key) FROM role_permissions rp
      JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = m.role_id AND p.key IN (${first}, ${second})
    ) = 2
  `;
  if ((rows[0]?.count ?? 0n) === 0n)
    throw new TeamConflict(
      'At least one member must keep the member.manage and role.manage permissions.',
    );
}

export class PrismaTeamRepository
  implements TeamRepository, OnApplicationShutdown
{
  private readonly client: PrismaClient;
  constructor(databaseUrl: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5000,
      }),
    });
  }

  async onApplicationShutdown() {
    await this.client.$disconnect();
  }

  async listMembers(organizationId: string, query: ListQuery) {
    const members = await this.client.organizationMember.findMany({
      where: {
        organizationId,
        ...(query.after ? { userId: { gt: query.after } } : {}),
      },
      select: memberSelect,
      orderBy: { userId: 'asc' },
      take: query.limit + 1,
    });
    const items = members.slice(0, query.limit).map(summarizeMember);
    return {
      items,
      nextCursor: members.length > query.limit ? items.at(-1)!.userId : null,
    };
  }

  async findMember(organizationId: string, userId: string) {
    const member = await this.client.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: memberSelect,
    });
    return member ? summarizeMember(member) : null;
  }

  updateMemberRole(
    organizationId: string,
    userId: string,
    roleId: string,
    actor: AuditActor,
  ) {
    return this.client.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const before = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: memberSelect,
      });
      if (!before) return null;
      const { count } = await tx.organizationMember.updateMany({
        where: { organizationId, userId },
        data: { roleId },
      });
      if (count === 0) return null;
      await assertManageable(tx, organizationId);
      const member = await tx.organizationMember.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId, userId } },
        select: memberSelect,
      });
      if (before.role.id !== member.role.id)
        await recordAudit(tx, organizationId, actor, {
          action: 'member.role_changed',
          targetType: 'member',
          targetId: userId,
          metadata: {
            email: member.user.email,
            from: { id: before.role.id, name: before.role.name },
            to: { id: member.role.id, name: member.role.name },
          },
        });
      return summarizeMember(member);
    });
  }

  removeMember(organizationId: string, userId: string, actor: AuditActor) {
    return this.client.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const member = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: memberSelect,
      });
      if (!member) return false;
      const { count } = await tx.organizationMember.deleteMany({
        where: { organizationId, userId },
      });
      if (count === 0) return false;
      await assertManageable(tx, organizationId);
      const role = { id: member.role.id, name: member.role.name };
      await recordAudit(
        tx,
        organizationId,
        actor,
        userId === actor.userId
          ? {
              action: 'member.left',
              targetType: 'member',
              targetId: userId,
              metadata: { email: member.user.email, role },
            }
          : {
              action: 'member.removed',
              targetType: 'member',
              targetId: userId,
              metadata: { email: member.user.email, role },
            },
      );
      return true;
    });
  }

  transferOwnership(
    organizationId: string,
    toUserId: string,
    newRoleId: string,
    actor: AuditActor,
  ): Promise<TransferResult> {
    return this.client.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const memberRole = (userId: string) =>
        tx.organizationMember.findUnique({
          where: { organizationId_userId: { organizationId, userId } },
          select: { role: { select: { id: true, system: true } } },
        });
      const current = await memberRole(actor.userId);
      if (!current?.role.system) return { status: 'not_owner' };
      const target = await memberRole(toUserId);
      if (!target) return { status: 'target_not_found' };
      if (target.role.system) return { status: 'already_owner' };
      const newRole = await tx.role.findFirst({
        where: { id: newRoleId, organizationId },
        select: { id: true, name: true, system: true },
      });
      if (!newRole) return { status: 'role_not_found' };
      if (newRole.system) return { status: 'system_role' };
      const ownerRoleId = current.role.id;
      await tx.organizationMember.update({
        where: { organizationId_userId: { organizationId, userId: toUserId } },
        data: { roleId: ownerRoleId },
      });
      await tx.organizationMember.update({
        where: {
          organizationId_userId: { organizationId, userId: actor.userId },
        },
        data: { roleId: newRole.id },
      });
      await assertManageable(tx, organizationId);
      const [owner, previous] = await Promise.all(
        [toUserId, actor.userId].map((userId) =>
          tx.organizationMember.findUniqueOrThrow({
            where: { organizationId_userId: { organizationId, userId } },
            select: memberSelect,
          }),
        ),
      );
      await recordAudit(tx, organizationId, actor, {
        action: 'ownership.transferred',
        targetType: 'member',
        targetId: toUserId,
        metadata: {
          email: owner!.user.email,
          previousOwnerRole: { id: newRole.id, name: newRole.name },
        },
      });
      return {
        status: 'transferred',
        owner: summarizeMember(owner!),
        previous: summarizeMember(previous!),
      };
    });
  }

  async listRoles(organizationId: string) {
    const roles = await this.client.role.findMany({
      where: { organizationId },
      select: roleSelect,
      orderBy: [{ system: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return roles.map(summarizeRole);
  }

  async findRole(organizationId: string, roleId: string) {
    const role = await this.client.role.findFirst({
      where: { id: roleId, organizationId },
      select: roleSelect,
    });
    return role ? summarizeRole(role) : null;
  }

  async createRole(
    organizationId: string,
    input: RoleInput,
    actor: AuditActor,
  ) {
    const role = await conflictOnUnique(
      () =>
        this.client.$transaction(async (tx) => {
          const created = await tx.role.create({
            data: {
              organizationId,
              name: input.name,
              slug: input.slug,
              description: input.description,
              permissions: {
                create: input.permissions.map((key) => ({
                  permission: { connect: { key } },
                })),
              },
            },
            select: roleSelect,
          });
          const summary = summarizeRole(created);
          await recordAudit(tx, organizationId, actor, {
            action: 'role.created',
            targetType: 'role',
            targetId: summary.id,
            metadata: {
              name: summary.name,
              slug: summary.slug,
              permissions: summary.permissions,
            },
          });
          return summary;
        }),
      'This role slug is already in use.',
    );
    return role;
  }

  updateRole(
    organizationId: string,
    roleId: string,
    input: RoleUpdateInput,
    actor: AuditActor,
  ) {
    return conflictOnUnique(
      () =>
        this.client.$transaction(async (tx) => {
          await lockOrganization(tx, organizationId);
          const existing = await tx.role.findFirst({
            where: { id: roleId, organizationId },
            select: roleSelect,
          });
          if (!existing) return null;
          if (existing.system)
            throw new TeamConflict('System roles cannot be changed.');
          const before = summarizeRole(existing);
          await tx.role.update({
            where: { id: roleId },
            data: {
              ...(input.name !== undefined ? { name: input.name } : {}),
              ...(input.slug !== undefined ? { slug: input.slug } : {}),
              ...(input.description !== undefined
                ? { description: input.description }
                : {}),
            },
          });
          if (input.permissions !== undefined) {
            await tx.rolePermission.deleteMany({ where: { roleId } });
            const permissions = await tx.permission.findMany({
              where: { key: { in: input.permissions } },
              select: { id: true },
            });
            await tx.rolePermission.createMany({
              data: permissions.map((permission) => ({
                roleId,
                permissionId: permission.id,
              })),
            });
            await assertManageable(tx, organizationId);
          }
          const after = summarizeRole(
            await tx.role.findUniqueOrThrow({
              where: { id: roleId },
              select: roleSelect,
            }),
          );
          const changes: Record<string, [string | null, string | null]> = {};
          for (const field of ['name', 'slug', 'description'] as const)
            if (before[field] !== after[field])
              changes[field] = [before[field], after[field]];
          const permissionsAdded = difference(
            after.permissions,
            before.permissions,
          );
          const permissionsRemoved = difference(
            before.permissions,
            after.permissions,
          );
          if (
            Object.keys(changes).length > 0 ||
            permissionsAdded.length > 0 ||
            permissionsRemoved.length > 0
          )
            await recordAudit(tx, organizationId, actor, {
              action: 'role.updated',
              targetType: 'role',
              targetId: roleId,
              metadata: {
                name: after.name,
                changes,
                permissionsAdded,
                permissionsRemoved,
              },
            });
          return after;
        }),
      'This role slug is already in use.',
    );
  }

  deleteRole(organizationId: string, roleId: string, actor: AuditActor) {
    return this.client.$transaction(async (tx) => {
      await lockOrganization(tx, organizationId);
      const role = await tx.role.findFirst({
        where: { id: roleId, organizationId },
        select: roleSelect,
      });
      if (!role) return false;
      if (role.system)
        throw new TeamConflict('System roles cannot be changed.');
      if (role._count.members > 0 || role._count.invitations > 0)
        throw new TeamConflict(
          'Reassign members and revoke open invitations that use this role before deleting it.',
        );
      // Closed invitations only reference the role historically.
      await tx.organizationInvitation.deleteMany({
        where: { roleId, organizationId },
      });
      await tx.role.delete({ where: { id: roleId } });
      const summary = summarizeRole(role);
      await recordAudit(tx, organizationId, actor, {
        action: 'role.deleted',
        targetType: 'role',
        targetId: roleId,
        metadata: {
          name: summary.name,
          slug: summary.slug,
          permissions: summary.permissions,
        },
      });
      return true;
    });
  }

  async listInvitations(organizationId: string, query: ListQuery, now: Date) {
    const invitations = await this.client.organizationInvitation.findMany({
      where: {
        organizationId,
        ...openInvitation,
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      select: invitationSelect,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const items = invitations
      .slice(0, query.limit)
      .map((invitation) => summarizeInvitation(invitation, now));
    return {
      items,
      nextCursor: invitations.length > query.limit ? items.at(-1)!.id : null,
    };
  }

  async findInvitation(
    organizationId: string,
    invitationId: string,
    now: Date,
  ) {
    const invitation = await this.client.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId },
      select: invitationSelect,
    });
    return invitation ? summarizeInvitation(invitation, now) : null;
  }

  createInvitation(
    organizationId: string,
    input: InvitationRecord,
    now: Date,
    actor: AuditActor,
  ) {
    return conflictOnUnique(
      () =>
        this.client.$transaction(async (tx) => {
          const member = await tx.organizationMember.findFirst({
            where: {
              organizationId,
              user: { email: { equals: input.email, mode: 'insensitive' } },
            },
            select: { userId: true },
          });
          if (member)
            throw new TeamConflict(
              'This person is already a member of the organization.',
            );
          // Expired open invitations would otherwise block the partial index.
          await tx.organizationInvitation.updateMany({
            where: {
              organizationId,
              email: input.email,
              ...openInvitation,
              expiresAt: { lte: now },
            },
            data: { revokedAt: now },
          });
          const invitation = await tx.organizationInvitation.create({
            data: { organizationId, ...input },
            select: invitationSelect,
          });
          await recordAudit(tx, organizationId, actor, {
            action: 'invitation.created',
            targetType: 'invitation',
            targetId: invitation.id,
            metadata: {
              email: invitation.email,
              role: { id: invitation.role.id, name: invitation.role.name },
            },
          });
          return summarizeInvitation(invitation, now);
        }),
      'An open invitation already exists for this email address.',
    );
  }

  rotateInvitation(
    organizationId: string,
    invitationId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
    actor: AuditActor,
  ) {
    return this.client.$transaction(async (tx) => {
      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitationId, organizationId, ...openInvitation },
        data: { tokenHash, expiresAt },
      });
      if (count === 0) return null;
      const invitation = await tx.organizationInvitation.findUniqueOrThrow({
        where: { id: invitationId },
        select: invitationSelect,
      });
      await recordAudit(tx, organizationId, actor, {
        action: 'invitation.resent',
        targetType: 'invitation',
        targetId: invitationId,
        metadata: { email: invitation.email },
      });
      return summarizeInvitation(invitation, now);
    });
  }

  revokeInvitation(
    organizationId: string,
    invitationId: string,
    now: Date,
    actor: AuditActor,
  ) {
    return this.client.$transaction(async (tx) => {
      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitationId, organizationId, ...openInvitation },
        data: { revokedAt: now },
      });
      const invitation = await tx.organizationInvitation.findFirst({
        where: { id: invitationId, organizationId },
        select: invitationSelect,
      });
      // Revoking an already closed invitation is idempotent and not recorded.
      if (invitation && count === 1)
        await recordAudit(tx, organizationId, actor, {
          action: 'invitation.revoked',
          targetType: 'invitation',
          targetId: invitationId,
          metadata: { email: invitation.email },
        });
      return invitation ? summarizeInvitation(invitation, now) : null;
    });
  }

  async listPendingInvitations(
    email: string,
    now: Date,
  ): Promise<PendingInvitation[]> {
    return this.client.organizationInvitation.findMany({
      where: { email, ...openInvitation, expiresAt: { gt: now } },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        role: { select: roleReference },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  acceptInvitation(
    lookup: InvitationLookup,
    actor: AuditActor,
    now: Date,
  ): Promise<AcceptResult> {
    const { userId, email } = actor;
    return this.client.$transaction(async (tx) => {
      const invitation = await tx.organizationInvitation.findFirst({
        where:
          'tokenHash' in lookup
            ? { tokenHash: lookup.tokenHash }
            : { id: lookup.invitationId },
        select: {
          id: true,
          email: true,
          roleId: true,
          organizationId: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          organization: { select: { id: true, name: true, slug: true } },
          role: { select: roleReference },
        },
      });
      if (!invitation) return { status: 'not_found' };
      if (invitation.email !== email) return { status: 'email_mismatch' };
      const { organizationId, organization } = invitation;
      const existing = await tx.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId } },
        select: { userId: true },
      });
      if (existing) {
        await tx.organizationInvitation.updateMany({
          where: { id: invitation.id, ...openInvitation },
          data: { acceptedAt: now, acceptedByUserId: userId },
        });
        return { status: 'already_member', organization };
      }
      // Claim atomically: a concurrent accept or revoke leaves count 0.
      const { count } = await tx.organizationInvitation.updateMany({
        where: { id: invitation.id, ...openInvitation, expiresAt: { gt: now } },
        data: { acceptedAt: now, acceptedByUserId: userId },
      });
      if (count === 0) return { status: 'gone' };
      await tx.organizationMember.create({
        data: { organizationId, userId, roleId: invitation.roleId },
      });
      await recordAudit(tx, organizationId, actor, {
        action: 'invitation.accepted',
        targetType: 'invitation',
        targetId: invitation.id,
        metadata: {
          email: invitation.email,
          role: { id: invitation.role.id, name: invitation.role.name },
        },
      });
      return { status: 'accepted', organization };
    });
  }
}
