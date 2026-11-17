import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type {
  OrganizationAccess,
  WorkspaceRepository,
} from './workspace.repository.js';

/**
 * Session-route authorization shared by platform services. Non-members receive
 * 404 so organization existence is not disclosed; members without the
 * permission receive 403. Checks use permission keys, never role names.
 */
export async function requireOrganizationPermission(
  repository: Pick<WorkspaceRepository, 'getOrganization'>,
  userId: string,
  organizationId: string,
  permission: string,
): Promise<OrganizationAccess> {
  const organization = await repository.getOrganization(userId, organizationId);
  if (!organization) throw new NotFoundException('Organization not found.');
  if (!organization.permissions.includes(permission))
    throw new ForbiddenException(`The ${permission} permission is required.`);
  return organization;
}

/** True when every permission in `granted` is held by the actor. */
export function holdsAll(actor: readonly string[], granted: readonly string[]) {
  return granted.every((permission) => actor.includes(permission));
}
