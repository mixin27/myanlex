import type { Page } from './workspace.repository.js';
import type { ListQuery } from './platform.schemas.js';
import type { RoleInput, RoleUpdateInput } from './team.schemas.js';

export const TEAM_REPOSITORY = Symbol('TEAM_REPOSITORY');

/** Permissions that together keep an organization manageable. */
export const managementPermissions = ['member.manage', 'role.manage'] as const;

export interface RoleReference {
  id: string;
  name: string;
  slug: string;
}
export interface RoleSummary extends RoleReference {
  description: string | null;
  system: boolean;
  permissions: string[];
  memberCount: number;
  invitationCount: number;
}
export interface MemberSummary {
  userId: string;
  name: string;
  email: string;
  role: RoleReference;
  permissions: string[];
  joinedAt: Date;
}
export type InvitationStatus = 'pending' | 'expired' | 'accepted' | 'revoked';
export interface InvitationSummary {
  id: string;
  email: string;
  role: RoleReference;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}
export interface PendingInvitation {
  id: string;
  organization: { id: string; name: string; slug: string };
  role: RoleReference;
  expiresAt: Date;
  createdAt: Date;
}
export interface InvitationRecord {
  email: string;
  roleId: string;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}
export type InvitationLookup = { tokenHash: string } | { invitationId: string };
export type AcceptResult =
  | {
      status: 'accepted' | 'already_member';
      organization: { id: string; name: string; slug: string };
    }
  | { status: 'not_found' | 'gone' | 'email_mismatch' };

/**
 * Raised for state conflicts: duplicate slugs or invitations, system roles,
 * roles in use, and changes that would leave no member able to manage both
 * members and roles.
 */
export class TeamConflict extends Error {}

export interface TeamRepository {
  listMembers(
    organizationId: string,
    query: ListQuery,
  ): Promise<{ items: MemberSummary[]; nextCursor: string | null }>;
  findMember(
    organizationId: string,
    userId: string,
  ): Promise<MemberSummary | null>;
  /** Changes a member's role; throws TeamConflict if no manager would remain. */
  updateMemberRole(
    organizationId: string,
    userId: string,
    roleId: string,
  ): Promise<MemberSummary | null>;
  /** Removes a member; throws TeamConflict if no manager would remain. */
  removeMember(organizationId: string, userId: string): Promise<boolean>;

  listRoles(organizationId: string): Promise<RoleSummary[]>;
  findRole(organizationId: string, roleId: string): Promise<RoleSummary | null>;
  createRole(organizationId: string, input: RoleInput): Promise<RoleSummary>;
  updateRole(
    organizationId: string,
    roleId: string,
    input: RoleUpdateInput,
  ): Promise<RoleSummary | null>;
  deleteRole(organizationId: string, roleId: string): Promise<boolean>;

  listInvitations(
    organizationId: string,
    query: ListQuery,
    now: Date,
  ): Promise<Page<InvitationSummary>>;
  findInvitation(
    organizationId: string,
    invitationId: string,
    now: Date,
  ): Promise<InvitationSummary | null>;
  createInvitation(
    organizationId: string,
    input: InvitationRecord,
    now: Date,
  ): Promise<InvitationSummary>;
  /** Replaces the token and expiry of an open invitation. */
  rotateInvitation(
    organizationId: string,
    invitationId: string,
    tokenHash: string,
    expiresAt: Date,
    now: Date,
  ): Promise<InvitationSummary | null>;
  revokeInvitation(
    organizationId: string,
    invitationId: string,
    now: Date,
  ): Promise<InvitationSummary | null>;
  listPendingInvitations(
    email: string,
    now: Date,
  ): Promise<PendingInvitation[]>;
  acceptInvitation(
    lookup: InvitationLookup,
    userId: string,
    email: string,
    now: Date,
  ): Promise<AcceptResult>;
}
