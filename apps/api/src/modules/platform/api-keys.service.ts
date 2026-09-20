import { randomBytes, createHash } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import type { ListQuery } from './platform.schemas.js';
import { apiKeyInput } from './api-key.schemas.js';
import type { ApiKeyInput } from './api-key.schemas.js';

@Injectable()
export class ApiKeysService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
  ) {}

  private async authorize(
    userId: string,
    organizationId: string,
    projectId: string,
    permission: string,
  ) {
    const organization = await this.repository.getOrganization(
      userId,
      organizationId,
    );
    if (!organization) throw new NotFoundException('Organization not found.');
    if (!organization.permissions.includes(permission))
      throw new ForbiddenException(`The ${permission} permission is required.`);
    if (!(await this.repository.findProject(organizationId, projectId)))
      throw new NotFoundException('Project not found.');
    return organization;
  }

  async list(
    userId: string,
    organizationId: string,
    projectId: string,
    query: ListQuery,
  ) {
    await this.authorize(userId, organizationId, projectId, 'api_key.read');
    return this.repository.listApiKeys(organizationId, projectId, query);
  }

  async create(
    userId: string,
    organizationId: string,
    projectId: string,
    input: ApiKeyInput,
  ) {
    const organization = await this.authorize(
      userId,
      organizationId,
      projectId,
      'api_key.create',
    );
    const parsed = apiKeyInput.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException('Invalid API-key input.');
    if (
      parsed.data.scopes.some(
        (scope) => !organization.permissions.includes(scope),
      )
    )
      throw new ForbiddenException(
        'You cannot delegate a permission you do not hold.',
      );
    const expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;
    if (expiresAt && expiresAt.getTime() <= Date.now())
      throw new BadRequestException('Expiration must be in the future.');
    const secret = `mylx_${randomBytes(32).toString('base64url')}`;
    const key = await this.repository.createApiKey(organizationId, projectId, {
      name: parsed.data.name,
      prefix: secret.slice(0, 13),
      keyHash: createHash('sha256').update(secret).digest('hex'),
      scopes: [...new Set(parsed.data.scopes)],
      expiresAt,
    });
    return { ...key, secret };
  }

  async revoke(
    userId: string,
    organizationId: string,
    projectId: string,
    keyId: string,
  ) {
    await this.authorize(userId, organizationId, projectId, 'api_key.revoke');
    const key = await this.repository.revokeApiKey(
      organizationId,
      projectId,
      keyId,
      new Date(),
    );
    if (!key) throw new NotFoundException('API key not found.');
    return key;
  }
}
