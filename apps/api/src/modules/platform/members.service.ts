import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { TEAM_REPOSITORY } from './team.repository.js';
import type { TeamRepository } from './team.repository.js';
import type { ListQuery } from './platform.schemas.js';
import type { MemberUpdateInput } from './team.schemas.js';
import {
  holdsAll,
  requireOrganizationPermission,
} from './organization-access.js';
import { teamWrite } from './team-errors.js';
import type { AuditActor } from './audit.js';

@Injectable()
export class MembersService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
    @Inject(TEAM_REPOSITORY) private readonly team: TeamRepository,
  ) {}

  async list(userId: string, organizationId: string, query: ListQuery) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'member.read',
    );
    return this.team.listMembers(organizationId, query);
  }

  async update(
    actor: AuditActor,
    organizationId: string,
    memberId: string,
    input: MemberUpdateInput,
  ) {
    const access = await requireOrganizationPermission(
      this.repository,
      actor.userId,
      organizationId,
      'member.manage',
    );
    const member = await this.team.findMember(organizationId, memberId);
    if (!member) throw new NotFoundException('Member not found.');
    const role = await this.team.findRole(organizationId, input.roleId);
    if (!role) throw new NotFoundException('Role not found.');
    // Actors may neither grant nor take away permissions they do not hold.
    if (
      !holdsAll(access.permissions, role.permissions) ||
      !holdsAll(access.permissions, member.permissions)
    )
      throw new ForbiddenException(
        'You cannot change a role that has permissions you do not hold.',
      );
    const updated = await teamWrite(() =>
      this.team.updateMemberRole(organizationId, memberId, role.id, actor),
    );
    if (!updated) throw new NotFoundException('Member not found.');
    return updated;
  }

  async remove(actor: AuditActor, organizationId: string, memberId: string) {
    const { userId } = actor;
    if (memberId === userId) {
      // Leaving needs membership only; the last-manager guard still applies.
      const organization = await this.repository.getOrganization(
        userId,
        organizationId,
      );
      if (!organization) throw new NotFoundException('Organization not found.');
    } else {
      const access = await requireOrganizationPermission(
        this.repository,
        userId,
        organizationId,
        'member.manage',
      );
      const member = await this.team.findMember(organizationId, memberId);
      if (!member) throw new NotFoundException('Member not found.');
      if (!holdsAll(access.permissions, member.permissions))
        throw new ForbiddenException(
          'You cannot remove a member who has permissions you do not hold.',
        );
    }
    const removed = await teamWrite(() =>
      this.team.removeMember(organizationId, memberId, actor),
    );
    if (!removed) throw new NotFoundException('Member not found.');
  }
}
