import { createHash, randomBytes } from 'node:crypto';
import {
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountAuthService } from '../account-auth/account-auth.service.js';
import type { MailDelivery } from '../account-auth/account-auth.service.js';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type {
  OrganizationSummary,
  WorkspaceRepository,
} from './workspace.repository.js';
import { TEAM_REPOSITORY } from './team.repository.js';
import type {
  InvitationLookup,
  InvitationSummary,
  TeamRepository,
} from './team.repository.js';
import type { ListQuery } from './platform.schemas.js';
import type { InvitationAcceptInput, InvitationInput } from './team.schemas.js';
import {
  holdsAll,
  requireOrganizationPermission,
} from './organization-access.js';
import { teamWrite } from './team-errors.js';

export const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export function hashInvitationToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
    @Inject(TEAM_REPOSITORY) private readonly team: TeamRepository,
    @Inject(AccountAuthService) private readonly accounts: AccountAuthService,
  ) {}

  async list(userId: string, organizationId: string, query: ListQuery) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'member.read',
    );
    return this.team.listInvitations(organizationId, query, new Date());
  }

  private async manage(userId: string, organizationId: string, roleId: string) {
    const actor = await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'member.manage',
    );
    const role = await this.team.findRole(organizationId, roleId);
    if (!role) throw new NotFoundException('Role not found.');
    if (!holdsAll(actor.permissions, role.permissions))
      throw new ForbiddenException(
        'You cannot invite someone into a role with permissions you do not hold.',
      );
    return actor;
  }

  async create(userId: string, organizationId: string, input: InvitationInput) {
    const organization = await this.manage(
      userId,
      organizationId,
      input.roleId,
    );
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + invitationLifetimeMs);
    const invitation = await teamWrite(() =>
      this.team.createInvitation(
        organizationId,
        {
          email: input.email,
          roleId: input.roleId,
          tokenHash: hashInvitationToken(token),
          invitedByUserId: userId,
          expiresAt,
        },
        now,
      ),
    );
    return this.deliver(organization, invitation, token);
  }

  async resend(userId: string, organizationId: string, invitationId: string) {
    const existing = await this.findOpen(userId, organizationId, invitationId);
    const organization = await this.manage(
      userId,
      organizationId,
      existing.role.id,
    );
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const invitation = await this.team.rotateInvitation(
      organizationId,
      invitationId,
      hashInvitationToken(token),
      new Date(now.getTime() + invitationLifetimeMs),
      now,
    );
    if (!invitation) throw new NotFoundException('Invitation not found.');
    return this.deliver(organization, invitation, token);
  }

  async revoke(userId: string, organizationId: string, invitationId: string) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'member.manage',
    );
    const invitation = await this.team.revokeInvitation(
      organizationId,
      invitationId,
      new Date(),
    );
    if (!invitation) throw new NotFoundException('Invitation not found.');
    return invitation;
  }

  pending(email: string) {
    return this.team
      .listPendingInvitations(email.toLowerCase(), new Date())
      .then((items) => ({ items }));
  }

  async accept(userId: string, email: string, input: InvitationAcceptInput) {
    const lookup: InvitationLookup =
      'token' in input
        ? { tokenHash: hashInvitationToken(input.token) }
        : { invitationId: input.invitationId };
    const result = await this.team.acceptInvitation(
      lookup,
      userId,
      email.toLowerCase(),
      new Date(),
    );
    switch (result.status) {
      case 'accepted':
      case 'already_member':
        return result;
      case 'gone':
        throw new GoneException(
          'This invitation has expired, been revoked, or already been used.',
        );
      case 'email_mismatch':
        // An id from someone else's invitation is indistinguishable from none.
        if ('invitationId' in lookup)
          throw new NotFoundException('Invitation not found.');
        throw new ForbiddenException(
          'This invitation was sent to a different email address. Sign in with that address to accept it.',
        );
      default:
        throw new NotFoundException('Invitation not found.');
    }
  }

  private async findOpen(
    userId: string,
    organizationId: string,
    invitationId: string,
  ) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'member.manage',
    );
    const invitation = await this.team.findInvitation(
      organizationId,
      invitationId,
      new Date(),
    );
    if (
      !invitation ||
      invitation.status === 'accepted' ||
      invitation.status === 'revoked'
    )
      throw new NotFoundException('Invitation not found.');
    return invitation;
  }

  private async deliver(
    organization: OrganizationSummary,
    invitation: InvitationSummary,
    token: string,
  ): Promise<InvitationSummary & { emailDelivery: MailDelivery }> {
    const base = this.accounts.publicURL;
    if (!base) return { ...invitation, emailDelivery: 'disabled' };
    const url = new URL('/invitations/accept', base);
    url.searchParams.set('token', token);
    // Plain text, no role names: the organization name is the only tenant data.
    const emailDelivery = await this.accounts.sendMail({
      to: invitation.email,
      subject: `You're invited to join ${organization.name} on MyanLex`,
      text: [
        `You have been invited to join the "${organization.name}" organization on MyanLex.`,
        '',
        `Accept the invitation: ${url.toString()}`,
        '',
        `This link expires on ${invitation.expiresAt.toISOString().slice(0, 10)} (UTC).`,
        'If you were not expecting this invitation, you can ignore this email.',
      ].join('\n'),
    });
    return { ...invitation, emailDelivery };
  }
}
