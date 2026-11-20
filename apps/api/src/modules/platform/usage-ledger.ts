import type {
  StoredCharges,
  StoredTerms,
} from '../../common/billing/pricing.js';

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
  })[];
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
