export const QUOTA_REPOSITORY = Symbol('QUOTA_REPOSITORY');

export interface QuotaDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface QuotaRepository {
  consume(projectId: string, characters: number): Promise<QuotaDecision>;
}
