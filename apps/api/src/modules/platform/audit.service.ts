import { Inject, Injectable } from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { AUDIT_REPOSITORY } from './audit.js';
import type { AuditRepository } from './audit.js';
import { requireOrganizationPermission } from './organization-access.js';
import { encodeAuditCursor } from './audit.schemas.js';
import type { AuditQueryInput } from './audit.schemas.js';

@Injectable()
export class AuditService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
    @Inject(AUDIT_REPOSITORY) private readonly audit: AuditRepository,
  ) {}

  async list(userId: string, organizationId: string, query: AuditQueryInput) {
    await requireOrganizationPermission(
      this.repository,
      userId,
      organizationId,
      'audit.read',
    );
    const { items, hasMore } = await this.audit.list(organizationId, query);
    return {
      items,
      nextCursor:
        hasMore && items.length ? encodeAuditCursor(items.at(-1)!) : null,
    };
  }
}
