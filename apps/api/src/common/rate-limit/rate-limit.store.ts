import type { RateLimitDecision } from './rate-limit.service.js';

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

export interface RateLimitStore {
  consume(tracker: string): RateLimitDecision | Promise<RateLimitDecision>;
}
