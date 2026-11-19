import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { QUOTAS_ENABLED } from '../../common/tokens.js';
import { enforcedLimits } from '../../common/billing/pricing.js';
import {
  QUOTA_REPOSITORY,
  type QuotaRepository,
} from '../../common/quota/quota.repository.js';
import {
  WORKSPACE_REPOSITORY,
  type WorkspaceRepository,
} from './workspace.repository.js';

/**
 * `limit` is the plan allowance. On overage plans, `ceiling` is where
 * admission stops and `overage` is usage billed above the allowance.
 */
export function quotaDimension(
  used: bigint,
  limit: bigint | null,
  ceiling: bigint | null = limit,
) {
  return {
    used: used.toString(),
    limit: limit?.toString() ?? null,
    remaining:
      limit === null ? null : (limit > used ? limit - used : 0n).toString(),
    ceiling: ceiling?.toString() ?? null,
    overage: limit === null || used <= limit ? '0' : (used - limit).toString(),
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
    const enforced = enforcedLimits(snapshot.plan);
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
        overageMode: snapshot.plan.overageMode,
      },
      requests: quotaDimension(
        snapshot.requestCount,
        snapshot.plan.monthlyRequestLimit,
        enforced.requests,
      ),
      characters: quotaDimension(
        snapshot.characterCount,
        snapshot.plan.monthlyCharacterLimit,
        enforced.characters,
      ),
    };
  }
}
