import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { TEAM_REPOSITORY } from './team.repository.js';
import type { TeamRepository } from './team.repository.js';
import type { OwnershipTransferInput } from './team.schemas.js';
import type { AuditActor } from './audit.js';
import { teamWrite } from './team-errors.js';

@Injectable()
export class OwnershipService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
    @Inject(TEAM_REPOSITORY) private readonly team: TeamRepository,
  ) {}

  /**
   * Hands the system Owner role to another member and moves the actor to a
   * role they choose, in one transaction. Only a current Owner may transfer.
   */
  async transfer(
    actor: AuditActor,
    organizationId: string,
    input: OwnershipTransferInput,
  ) {
    const organization = await this.repository.getOrganization(
      actor.userId,
      organizationId,
    );
    if (!organization) throw new NotFoundException('Organization not found.');
    if (input.confirmSlug !== organization.slug)
      throw new BadRequestException(
        'Type the workspace slug exactly to confirm the transfer.',
      );
    if (input.toUserId === actor.userId)
      throw new BadRequestException('Choose another member to transfer to.');
    const result = await teamWrite(() =>
      this.team.transferOwnership(
        organizationId,
        input.toUserId,
        input.newRoleId,
        actor,
      ),
    );
    switch (result.status) {
      case 'transferred':
        return { owner: result.owner, previousOwner: result.previous };
      case 'not_owner':
        throw new ForbiddenException(
          'Only a member with the Owner role can transfer ownership.',
        );
      case 'target_not_found':
        throw new NotFoundException('Member not found.');
      case 'already_owner':
        throw new ConflictException('This member is already an Owner.');
      case 'role_not_found':
        throw new NotFoundException('Role not found.');
      case 'system_role':
        throw new BadRequestException(
          'Choose a non-Owner role for yourself after the transfer.',
        );
    }
  }
}
