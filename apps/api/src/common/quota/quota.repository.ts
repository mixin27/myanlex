export const QUOTA_REPOSITORY = Symbol('QUOTA_REPOSITORY');

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface QuotaRepository {
  consume(projectId: string, characters: number): Promise<QuotaDecision>;
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
