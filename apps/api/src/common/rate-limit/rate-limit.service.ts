import { Inject, Injectable } from '@nestjs/common';

import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '../tokens.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  readonly #buckets = new Map<string, RateLimitBucket>();
  #nextCleanupAt = 0;

  constructor(
    @Inject(RATE_LIMIT_MAX_REQUESTS) private readonly limit: number,
    @Inject(RATE_LIMIT_WINDOW_MS) private readonly windowMs: number,
  ) {}

  consume(tracker: string, now = Date.now()): RateLimitDecision {
    this.#deleteExpiredBuckets(now);
    let bucket = this.#buckets.get(tracker);

    if (bucket === undefined || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.#buckets.set(tracker, bucket);
    }

    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - now) / 1_000),
    );

    if (bucket.count >= this.limit) {
      return {
        allowed: false,
        limit: this.limit,
        remaining: 0,
        retryAfterSeconds,
      };
    }

    bucket.count += 1;
    return {
      allowed: true,
      limit: this.limit,
      remaining: this.limit - bucket.count,
      retryAfterSeconds,
    };
  }

  #deleteExpiredBuckets(now: number): void {
    if (now < this.#nextCleanupAt) return;

    for (const [tracker, bucket] of this.#buckets) {
      if (now >= bucket.resetAt) this.#buckets.delete(tracker);
    }

    this.#nextCleanupAt = now + this.windowMs;
  }
}
