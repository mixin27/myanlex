import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QUOTAS_ENABLED } from '../../common/tokens.js';
import {
  QUOTA_REPOSITORY,
  type QuotaRepository,
} from '../../common/quota/quota.repository.js';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from './workspace.repository.js';

export function quotaDimension(used: bigint, limit: bigint | null) {
  return {
    used: used.toString(),
    limit: limit?.toString() ?? null,
    remaining:
      limit === null ? null : (limit > used ? limit - used : 0n).toString(),
  };
}

@Injectable()
export class QuotaReportService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspace: WorkspaceRepository,
    @Inject(QUOTA_REPOSITORY) private readonly quotas: QuotaRepository,
    @Inject(QUOTAS_ENABLED) private readonly enabled: boolean,
  ) {}

  async report(userId: string, organizationId: string) {
    const organization = await this.workspace.getOrganization(
      userId,
      organizationId,
    );
    if (!organization) throw new NotFoundException('Organization not found.');
    if (!organization.permissions.includes('usage.read'))
      throw new ForbiddenException('The usage.read permission is required.');
    const snapshot = await this.quotas.read(organizationId).catch(() => {
      throw new ServiceUnavailableException(
        'Quota reporting is temporarily unavailable.',
      );
    });
    return {
      organizationId,
      enforcementEnabled: this.enabled,
      timezone: 'UTC' as const,
      generatedAt: snapshot.now.toISOString(),
      periodStart: snapshot.monthStart.toISOString(),
      resetsAt: snapshot.resetsAt.toISOString(),
      metering: 'admission-reservations' as const,
      plan: {
        name: snapshot.plan.name,
        slug: snapshot.plan.slug,
        source: snapshot.plan.source,
      },
      requests: quotaDimension(
        snapshot.requestCount,
        snapshot.plan.monthlyRequestLimit,
      ),
      characters: quotaDimension(
        snapshot.characterCount,
        snapshot.plan.monthlyCharacterLimit,
      ),
    };
  }
}
