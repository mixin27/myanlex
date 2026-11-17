import { ServiceUnavailableException } from '@nestjs/common';
import type { TeamRepository } from '../../modules/platform/team.repository.js';

function unavailable(): never {
  throw new ServiceUnavailableException(
    'Platform persistence is not configured.',
  );
}
export const disabledTeamRepository: TeamRepository = {
  listMembers: unavailable,
  findMember: unavailable,
  updateMemberRole: unavailable,
  removeMember: unavailable,
  listRoles: unavailable,
  findRole: unavailable,
  createRole: unavailable,
  updateRole: unavailable,
  deleteRole: unavailable,
  listInvitations: unavailable,
  findInvitation: unavailable,
  createInvitation: unavailable,
  rotateInvitation: unavailable,
  revokeInvitation: unavailable,
  listPendingInvitations: unavailable,
  acceptInvitation: unavailable,
};
