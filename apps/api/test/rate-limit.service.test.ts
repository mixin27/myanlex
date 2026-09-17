import { describe, expect, it } from 'vitest';

import { RateLimitService } from '../src/common/rate-limit/rate-limit.service.js';

describe('RateLimitService', () => {
  it('enforces a fixed-window request limit', () => {
    const service = new RateLimitService(2, 60_000);

    expect(service.consume('key', 1_000)).toMatchObject({
      allowed: true,
      remaining: 1,
    });
    expect(service.consume('key', 1_001)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
    expect(service.consume('key', 1_002)).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
    });
  });

  it('starts a fresh allowance after the window expires', () => {
    const service = new RateLimitService(1, 1_000);

    expect(service.consume('key', 1_000).allowed).toBe(true);
    expect(service.consume('key', 1_999).allowed).toBe(false);
    expect(service.consume('key', 2_000)).toMatchObject({
      allowed: true,
      remaining: 0,
    });
  });
});
