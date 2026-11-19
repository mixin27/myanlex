import {
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { requireOrganizationPermission } from './organization-access.js';
import {
  USAGE_LEDGER_REPOSITORY,
  type UsageLedgerRepository,
} from './usage-ledger.js';
import { monthLabel } from './usage-statement.schemas.js';

/**
 * Read-only billing overview. Plans are assigned by operators
 * (`pnpm billing:assign`); see docs/decisions/0024-plans-and-pricing.md.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspace: WorkspaceRepository,
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly ledger: UsageLedgerRepository,
  ) {}

  async overview(userId: string, organizationId: string) {
    await requireOrganizationPermission(
      this.workspace,
      userId,
      organizationId,
      'billing.read',
    );
    const billing = await this.ledger
      .billing(organizationId)
      .catch((cause: unknown) => {
        if (cause instanceof HttpException) throw cause;
        throw new ServiceUnavailableException(
          'Billing is temporarily unavailable.',
        );
      });
    const now = billing.now.getTime();
    return {
      organizationId,
      generatedAt: billing.now.toISOString(),
      plan: billing.plan,
      currentMonth: {
        month: monthLabel(billing.month.monthStart),
        timezone: 'UTC' as const,
        totals: {
          requests: billing.month.requests.toString(),
          characters: billing.month.characters.toString(),
        },
        charges: { ...billing.month.charges, estimated: true },
      },
      subscriptions: billing.subscriptions.map((period) => ({
        id: period.id,
        plan: period.plan,
        startsAt: period.startsAt.toISOString(),
        endsAt: period.endsAt?.toISOString() ?? null,
        status:
          period.startsAt.getTime() > now
            ? ('scheduled' as const)
            : period.endsAt && period.endsAt.getTime() <= now
              ? ('ended' as const)
              : ('current' as const),
        note: period.note,
      })),
      publicPlans: billing.publicPlans,
    };
  }
}
