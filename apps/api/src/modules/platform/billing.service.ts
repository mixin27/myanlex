import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BILLING_NOTIFY_EMAIL,
  BILLING_PAYMENT_INSTRUCTIONS,
} from '../../common/tokens.js';
import {
  AccountAuthService,
  type MailDelivery,
} from '../account-auth/account-auth.service.js';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { requireOrganizationPermission } from './organization-access.js';
import type { AuditActor } from './audit.js';
import {
  PlanChangeError,
  USAGE_LEDGER_REPOSITORY,
  type InvoiceRecord,
  type PlanChangeRecord,
  type UsageLedgerRepository,
} from './usage-ledger.js';
import type { PlanChangeBody } from './billing.schemas.js';
import { monthLabel } from './usage-statement.schemas.js';

function unavailable(cause: unknown): never {
  if (cause instanceof HttpException) throw cause;
  if (cause instanceof PlanChangeError)
    switch (cause.code) {
      case 'open_change':
        throw new ConflictException(cause.message);
      case 'not_found':
        throw new NotFoundException(cause.message);
      case 'not_open':
        throw new ConflictException(cause.message);
      default:
        throw new BadRequestException(cause.message);
    }
  throw new ServiceUnavailableException('Billing is temporarily unavailable.');
}

const presentInvoice = (invoice: InvoiceRecord) => ({
  number: invoice.number,
  kind: invoice.kind,
  status: invoice.status,
  periodStart: invoice.periodStart.toISOString(),
  periodEnd: invoice.periodEnd.toISOString(),
  currency: invoice.currency,
  subtotalMinor: invoice.subtotalMinor.toString(),
  totalMinor: invoice.totalMinor.toString(),
  issuedAt: invoice.issuedAt.toISOString(),
  dueAt: invoice.dueAt.toISOString(),
  paidAt: invoice.paidAt?.toISOString() ?? null,
  voidedAt: invoice.voidedAt?.toISOString() ?? null,
  voidReason: invoice.voidReason,
  overdue: invoice.status === 'open' && invoice.dueAt.getTime() <= Date.now(),
  suspended: invoice.suspended,
  lines: invoice.lines.map((line) => ({
    kind: line.kind,
    description: line.description,
    quantity: line.quantity.toString(),
    unitMinor: line.unitMinor.toString(),
    amountMinor: line.amountMinor.toString(),
  })),
  payments: invoice.payments.map((payment) => ({
    method: payment.method,
    provider: payment.provider,
    amountMinor: payment.amountMinor.toString(),
    receivedAt: payment.receivedAt.toISOString(),
  })),
});

const presentChange = (change: PlanChangeRecord) => ({
  id: change.id,
  channel: change.channel,
  status: change.status,
  fromPlanSlug: change.fromPlanSlug,
  plan: change.plan,
  timing: change.timing,
  requestedStartsAt: change.requestedStartsAt?.toISOString() ?? null,
  note: change.note,
  requesterEmail: change.requesterEmail,
  createdAt: change.createdAt.toISOString(),
  decidedAt: change.decidedAt?.toISOString() ?? null,
  decisionNote: change.decisionNote,
});

/**
 * Billing overview and plan-change requests. Requests take the approval
 * channel: an operator applies them with `pnpm billing:changes`. See
 * docs/decisions/0024-plans-and-pricing.md and 0025-plan-changes.md.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspace: WorkspaceRepository,
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly ledger: UsageLedgerRepository,
    @Inject(AccountAuthService) private readonly accounts: AccountAuthService,
    @Inject(BILLING_NOTIFY_EMAIL)
    private readonly notifyEmail: string | null,
    @Inject(BILLING_PAYMENT_INSTRUCTIONS)
    private readonly paymentInstructions: string | null,
  ) {}

  async overview(userId: string, organizationId: string) {
    const access = await requireOrganizationPermission(
      this.workspace,
      userId,
      organizationId,
      'billing.read',
    );
    const billing = await this.ledger
      .billing(organizationId)
      .catch(unavailable);
    const now = billing.now.getTime();
    const changes = billing.changes.map(presentChange);
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
      freeChange: billing.freeChange,
      outstanding: billing.outstanding.map((balance) => ({
        currency: balance.currency,
        totalMinor: balance.totalMinor.toString(),
        invoices: balance.invoices,
        oldestDueAt: balance.oldestDueAt.toISOString(),
        overdue: balance.overdue,
      })),
      suspended: billing.suspended,
      paymentInstructions: this.paymentInstructions,
      changes,
      openChange:
        changes.find(
          (change) =>
            change.status === 'pending' || change.status === 'awaiting_payment',
        ) ?? null,
      canRequestChange: access.permissions.includes('billing.manage'),
    };
  }

  async invoices(
    userId: string,
    organizationId: string,
    query: { before?: string | undefined; limit: number },
  ) {
    await requireOrganizationPermission(
      this.workspace,
      userId,
      organizationId,
      'billing.read',
    );
    const rows = await this.ledger
      .invoices(organizationId, query.before ?? null, query.limit + 1)
      .catch(unavailable);
    const items = rows.slice(0, query.limit).map(presentInvoice);
    return {
      items,
      nextCursor: rows.length > query.limit ? items.at(-1)!.number : null,
    };
  }

  async invoice(userId: string, organizationId: string, number: string) {
    await requireOrganizationPermission(
      this.workspace,
      userId,
      organizationId,
      'billing.read',
    );
    const invoice = await this.ledger
      .invoice(organizationId, number)
      .catch(unavailable);
    if (!invoice) throw new NotFoundException('Invoice not found.');
    return {
      ...presentInvoice(invoice),
      paymentInstructions: this.paymentInstructions,
    };
  }

  async requestChange(
    actor: AuditActor,
    organizationId: string,
    body: PlanChangeBody,
  ) {
    const organization = await requireOrganizationPermission(
      this.workspace,
      actor.userId,
      organizationId,
      'billing.manage',
    );
    const change = await this.ledger
      .requestPlanChange(organizationId, actor, body)
      .catch(unavailable);
    const notification = await this.notify(organization.name, change);
    return { ...presentChange(change), notification };
  }

  async cancelChange(
    actor: AuditActor,
    organizationId: string,
    changeId: string,
  ) {
    await requireOrganizationPermission(
      this.workspace,
      actor.userId,
      organizationId,
      'billing.manage',
    );
    return presentChange(
      await this.ledger
        .cancelPlanChange(organizationId, changeId, actor)
        .catch(unavailable),
    );
  }

  /** Best-effort email to the operator's billing address; never fails the request. */
  private async notify(
    organizationName: string,
    change: PlanChangeRecord,
  ): Promise<MailDelivery> {
    if (!this.notifyEmail) return 'disabled';
    return this.accounts.sendMail({
      to: this.notifyEmail,
      subject: `Plan change request: ${organizationName} → ${change.plan.name}`,
      text: [
        `${change.requesterEmail} asked to move "${organizationName}" from ${change.fromPlanSlug} to ${change.plan.slug}.`,
        `Start: ${
          change.requestedStartsAt
            ? change.requestedStartsAt.toISOString().slice(0, 10) + ' (UTC)'
            : 'when approved'
        }`,
        ...(change.note ? ['', `Note: ${change.note}`] : []),
        '',
        `Review it with: pnpm billing:changes list`,
        `Change id: ${change.id}`,
      ].join('\n'),
    });
  }
}
