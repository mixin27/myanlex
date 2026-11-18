import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { TEAM_REPOSITORY } from './team.repository.js';
import type { RoleSummary, TeamRepository } from './team.repository.js';
import type { RoleInput, RoleUpdateInput } from './team.schemas.js';
import { permissionCatalog } from './permission-catalog.js';
import {
  holdsAll,
  requireOrganizationPermission,
} from './organization-access.js';
import { teamWrite } from './team-errors.js';
import type { AuditActor } from './audit.js';

const escalation = () =>
  new ForbiddenException(
    'You cannot grant or change permissions you do not hold.',
  );

@Injectable()
export class RolesService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
    @Inject(TEAM_REPOSITORY) private readonly team: TeamRepository,
  ) {}

  async list(userId: string, organizationId: string) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'role.read',
    );
    return { items: await this.team.listRoles(organizationId) };
  }

  async permissions(userId: string, organizationId: string) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'role.read',
    );
    return {
      items: permissionCatalog.map(([key, description]) => ({
        key,
        description,
      })),
    };
  }

  async create(actor: AuditActor, organizationId: string, input: RoleInput) {
    const access = await requireOrganizationPermission(
      this.repository,
      actor.userId,
      organizationId,
      'role.manage',
    );
    if (!holdsAll(access.permissions, input.permissions)) throw escalation();
    return teamWrite(() => this.team.createRole(organizationId, input, actor));
  }

  private async editable(
    userId: string,
    organizationId: string,
    roleId: string,
  ): Promise<{ actor: string[]; role: RoleSummary }> {
    const actor = await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'role.manage',
    );
    const role = await this.team.findRole(organizationId, roleId);
    if (!role) throw new NotFoundException('Role not found.');
    if (role.system)
      throw new ConflictException('System roles cannot be changed.');
    if (!holdsAll(actor.permissions, role.permissions)) throw escalation();
    return { actor: actor.permissions, role };
  }

  async update(
    actor: AuditActor,
    organizationId: string,
    roleId: string,
    input: RoleUpdateInput,
  ) {
    const { actor: held } = await this.editable(
      actor.userId,
      organizationId,
      roleId,
    );
    if (input.permissions && !holdsAll(held, input.permissions))
      throw escalation();
    const role = await teamWrite(() =>
      this.team.updateRole(organizationId, roleId, input, actor),
    );
    if (!role) throw new NotFoundException('Role not found.');
    return role;
  }

  async remove(actor: AuditActor, organizationId: string, roleId: string) {
    await this.editable(actor.userId, organizationId, roleId);
    const deleted = await teamWrite(() =>
      this.team.deleteRole(organizationId, roleId, actor),
    );
    if (!deleted) throw new NotFoundException('Role not found.');
  }
}
