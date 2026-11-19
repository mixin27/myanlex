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

/** Plan in effect at the end of the month (or now, for the open month). */
export interface StatementPlan {
  readonly name: string;
  readonly slug: string;
  readonly monthlyRequestLimit: string | null;
  readonly monthlyCharacterLimit: string | null;
}

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
