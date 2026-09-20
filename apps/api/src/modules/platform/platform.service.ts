import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WORKSPACE_REPOSITORY,
  WorkspaceConflict,
} from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import type {
  ListQuery,
  OrganizationInput,
  ProjectInput,
  ProjectUpdateInput,
} from './platform.schemas.js';

@Injectable()
export class PlatformService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
  ) {}

  listOrganizations(userId: string, query: ListQuery) {
    return this.repository.listOrganizations(userId, query);
  }

  async getOrganization(userId: string, organizationId: string) {
    const organization = await this.repository.getOrganization(
      userId,
      organizationId,
    );
    if (!organization) throw new NotFoundException('Organization not found.');
    return organization;
  }

  private async authorize(
    userId: string,
    organizationId: string,
    permission: string,
  ) {
    const organization = await this.getOrganization(userId, organizationId);
    if (!organization.permissions.includes(permission))
      throw new ForbiddenException(`The ${permission} permission is required.`);
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof WorkspaceConflict)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  createOrganization(userId: string, input: OrganizationInput) {
    return this.write(() => this.repository.createOrganization(userId, input));
  }

  async listProjects(userId: string, organizationId: string, query: ListQuery) {
    await this.authorize(userId, organizationId, 'project.read');
    return this.repository.listProjects(organizationId, query);
  }

  async createProject(
    userId: string,
    organizationId: string,
    input: ProjectInput,
  ) {
    await this.authorize(userId, organizationId, 'project.create');
    return this.write(() =>
      this.repository.createProject(organizationId, input),
    );
  }

  async updateProject(
    userId: string,
    organizationId: string,
    projectId: string,
    input: ProjectUpdateInput,
  ) {
    await this.authorize(userId, organizationId, 'project.update');
    const project = await this.write(() =>
      this.repository.updateProject(organizationId, projectId, input),
    );
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }
}
