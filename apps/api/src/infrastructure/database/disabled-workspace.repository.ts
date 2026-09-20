import { ServiceUnavailableException } from '@nestjs/common';
import type { WorkspaceRepository } from '../../modules/platform/workspace.repository.js';

function unavailable(): never {
  throw new ServiceUnavailableException(
    'Platform persistence is not configured.',
  );
}
export const disabledWorkspaceRepository: WorkspaceRepository = {
  findProject: unavailable,
  listApiKeys: unavailable,
  createApiKey: unavailable,
  revokeApiKey: unavailable,
  createOrganization: unavailable,
  listOrganizations: unavailable,
  getOrganization: unavailable,
  listProjects: unavailable,
  createProject: unavailable,
  updateProject: unavailable,
};
