export const QUOTA_REPOSITORY = Symbol('QUOTA_REPOSITORY');

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
  /** The billable ledger entry written with the reservation; null when denied. */
  readonly eventId: string | null;
}

/** One admitted request to meter (and, when enforcing, to check against limits). */
export interface MeterInput {
  readonly projectId: string;
  readonly characters: number;
  /** When false the request is recorded but plan limits never deny it. */
  readonly enforce: boolean;
  readonly source: 'api_key' | 'playground';
  readonly apiKeyId: string | null;
  readonly endpoint: string;
  readonly requestId?: string | undefined;
}

export interface QuotaRepository {
  /**
   * Reserves the request against the organization's monthly counter and writes
   * its usage_events ledger row in the same transaction.
   */
  meter(input: MeterInput): Promise<QuotaDecision>;
  read(organizationId: string): Promise<QuotaSnapshot>;
}

export interface QuotaSnapshot {
  now: Date;
  monthStart: Date;
  resetsAt: Date;
  plan: {
    name: string;
    slug: string;
    source: 'subscription' | 'free';
    monthlyRequestLimit: bigint | null;
    monthlyCharacterLimit: bigint | null;
  };
  requestCount: bigint;
  characterCount: bigint;
}
