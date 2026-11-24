import type { BillTo } from './billing-profile.js';
import type {
  StoredCharges,
  StoredTerms,
} from '../../common/billing/pricing.js';
import type { AuditActor } from './audit.js';

/** Billing-grade usage ledger types. See docs/decisions/0023. */
export const USAGE_LEDGER_REPOSITORY = Symbol('USAGE_LEDGER_REPOSITORY');

export type UsageSource = 'api_key' | 'playground';

/** One project/source/key row of a monthly statement. */
export interface StatementLine {
  readonly projectId: string;
  readonly projectName: string;
  readonly source: UsageSource;
  readonly apiKeyId: string | null;
  readonly apiKeyName: string | null;
  readonly apiKeyPrefix: string | null;
  readonly events: bigint;
  readonly requests: bigint;
  readonly characters: bigint;
}

/**
 * Plan in effect at the end of the month (or now, for the open month).
 * Statements closed before plan pricing (0024) hold only the first four fields.
 */
export type StatementPlan = Pick<
  StoredTerms,
  'name' | 'slug' | 'monthlyRequestLimit' | 'monthlyCharacterLimit'
> &
  Partial<
    Omit<
      StoredTerms,
      'name' | 'slug' | 'monthlyRequestLimit' | 'monthlyCharacterLimit'
    >
  >;

export interface UsageStatementRecord {
  readonly organizationId: string;
  readonly monthStart: Date;
  readonly status: 'open' | 'closed';
  readonly requestCount: bigint;
  readonly characterCount: bigint;
  readonly eventCount: bigint;
  readonly counterRequests: bigint;
  readonly counterCharacters: bigint;
  readonly reconciled: boolean;
  readonly plan: StatementPlan;
  /** Priced on the plan above; an estimate while open, null if closed before pricing. */
  readonly charges: StoredCharges | null;
  readonly lines: readonly StatementLine[];
  readonly closedAt: Date | null;
  readonly generatedAt: Date;
}

export interface LedgerEvent {
  readonly id: string;
  readonly createdAt: Date;
  readonly requestId: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly source: UsageSource;
  readonly apiKeyPrefix: string | null;
  readonly endpoint: string;
  readonly requestUnits: number;
  readonly characters: bigint;
}

export interface ClosedMonth {
  readonly organizationId: string;
  readonly monthStart: Date;
  readonly reconciled: boolean;
}

export interface UsageLedgerRepository {
  /** Start of the current UTC month by the database clock. */
  currentMonth(): Promise<Date>;
  /** The stored statement for a closed month, or live ledger totals. */
  statement(
    organizationId: string,
    monthStart: Date,
  ): Promise<UsageStatementRecord>;
  /** Ledger lines in (createdAt, id) order, after the keyset cursor. */
  events(
    organizationId: string,
    monthStart: Date,
    after: { readonly createdAt: Date; readonly id: string } | null,
    limit: number,
  ): Promise<LedgerEvent[]>;
  /** Writes statements for finished months that have none. Idempotent. */
  closeFinishedMonths(): Promise<ClosedMonth[]>;
  /** Deletes up to one batch of closed-month ledger rows before `before`. */
  cleanup(before: Date): Promise<number>;
  /** Current plan, subscription history, this month's estimate and public plans. */
  billing(organizationId: string): Promise<BillingOverview>;
  /** Opens an approval-channel plan change (ADR 0025). */
  requestPlanChange(
    organizationId: string,
    actor: AuditActor,
    input: PlanChangeInput,
  ): Promise<PlanChangeRecord>;
  /** The organization's invoices, newest first (keyset by number). */
  invoices(
    organizationId: string,
    before: string | null,
    limit: number,
  ): Promise<InvoiceRecord[]>;
  /** One invoice with lines and payments, or null. */
  invoice(
    organizationId: string,
    number: string,
  ): Promise<InvoiceRecord | null>;
  /** Cancels the organization's pending change. */
  cancelPlanChange(
    organizationId: string,
    changeId: string,
    actor: AuditActor,
  ): Promise<PlanChangeRecord>;
}

export type PlanChangeTiming = 'now' | 'next_month';

/** How a plan change is billed (ADR 0026): only upgrades may start now. */
export interface ChangePreview {
  readonly kind: 'upgrade' | 'downgrade' | 'currency';
  readonly nowAllowed: boolean;
  /** Invoiced for the rest of the month if it started now; null if nothing. */
  readonly prorationMinor: string | null;
  readonly currency: string;
}
export type PlanChangeStatus =
  | 'pending'
  | 'awaiting_payment'
  | 'applied'
  | 'rejected'
  | 'cancelled'
  | 'expired';

export interface PlanChangeInput {
  readonly planSlug: string;
  readonly timing: PlanChangeTiming;
  readonly note?: string | undefined;
}

export interface PlanChangeRecord {
  readonly id: string;
  readonly channel: 'approval' | 'checkout';
  readonly status: PlanChangeStatus;
  readonly fromPlanSlug: string;
  readonly plan: { readonly name: string; readonly slug: string };
  readonly timing: PlanChangeTiming;
  readonly requestedStartsAt: Date | null;
  readonly note: string | null;
  readonly requesterEmail: string;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
  readonly decisionNote: string | null;
}

/** Why a plan change was refused; mapped to HTTP by the billing service. */
export class PlanChangeError extends Error {
  constructor(
    readonly code:
      | 'unknown_plan'
      | 'current_plan'
      | 'open_change'
      | 'not_found'
      | 'not_open'
      | 'timing_not_allowed',
    message: string,
  ) {
    super(message);
  }
}

export interface SubscriptionPeriod {
  readonly id: string;
  readonly plan: { readonly name: string; readonly slug: string };
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly note: string | null;
}

export interface BillingOverview {
  readonly now: Date;
  readonly plan: StoredTerms & {
    readonly source: 'subscription' | 'free';
    readonly description: string | null;
  };
  readonly subscriptions: readonly SubscriptionPeriod[];
  readonly month: {
    readonly monthStart: Date;
    readonly requests: bigint;
    readonly characters: bigint;
    readonly charges: StoredCharges;
  };
  readonly publicPlans: readonly (StoredTerms & {
    readonly description: string | null;
    readonly changePolicy: 'approval' | 'self_service';
    /** How moving to this plan would be billed. */
    readonly change: ChangePreview;
  })[];
  /** How moving to Free would be billed. */
  readonly freeChange: ChangePreview;
  /** Open invoices by currency, and whether dunning moved the workspace to Free. */
  readonly outstanding: readonly OutstandingBalance[];
  readonly suspended: {
    readonly invoiceNumber: string;
    readonly plan: string;
  } | null;
  /** Latest plan changes, newest first. */
  readonly changes: readonly PlanChangeRecord[];
}

export const usageRetention = { defaultMonths: 13, minimumMonths: 13 } as const;

/** First retained month: `months` full months before the current month. */
export function retainedSince(currentMonth: Date, months: number): Date {
  return new Date(
    Date.UTC(
      currentMonth.getUTCFullYear(),
      currentMonth.getUTCMonth() - months,
      1,
    ),
  );
}

export interface OutstandingBalance {
  readonly currency: string;
  readonly totalMinor: bigint;
  readonly invoices: number;
  readonly oldestDueAt: Date;
  readonly overdue: boolean;
}

export interface InvoiceRecord {
  readonly number: string;
  /** Bill-to details as issued; null on invoices issued before they existed. */
  readonly billTo: BillTo | null;
  readonly kind: 'monthly' | 'proration';
  readonly status: 'open' | 'paid' | 'void';
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly currency: string;
  readonly subtotalMinor: bigint;
  readonly totalMinor: bigint;
  readonly issuedAt: Date;
  readonly dueAt: Date;
  readonly paidAt: Date | null;
  readonly voidedAt: Date | null;
  readonly voidReason: string | null;
  readonly suspended: boolean;
  readonly lines: readonly {
    readonly kind: string;
    readonly description: string;
    readonly quantity: bigint;
    readonly unitMinor: bigint;
    readonly amountMinor: bigint;
  }[];
  readonly payments: readonly {
    readonly method: string;
    readonly provider: string | null;
    readonly amountMinor: bigint;
    readonly receivedAt: Date;
  }[];
}
