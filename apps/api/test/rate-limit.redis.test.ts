import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { describe, expect, it } from 'vitest';
import { RedisRateLimitStore } from '../src/infrastructure/redis/redis-rate-limit.store.js';
import { createApiApplication } from '../src/create-api-application.js';

const url = process.env.MYANLEX_TEST_REDIS_URL;

describe.skipIf(!url)('Redis rate limiting', () => {
  it('shares atomic allowances across clients, isolates identities, and never extends a rejected window', async () => {
    const prefix = `test-${randomUUID()}`;
    const first = new RedisRateLimitStore(url!, prefix, 5, 1_000);
    const second = new RedisRateLimitStore(url!, prefix, 5, 1_000);
    const inspector = createClient({ url: url! });
    first.onModuleInit();
    second.onModuleInit();
    await inspector.connect();
    try {
      await expect
        .poll(() =>
          first
            .consume('ready-a')
            .then(() => true)
            .catch(() => false),
        )
        .toBe(true);
      await expect
        .poll(() =>
          second
            .consume('ready-b')
            .then(() => true)
            .catch(() => false),
        )
        .toBe(true);
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, index) =>
          (index % 2 ? first : second).consume('shared'),
        ),
      );
      expect(results.filter((result) => result.allowed)).toHaveLength(5);
      expect(await inspector.get(`${prefix}:rate:v1:shared`)).toBe('5');
      expect(await first.checkReady()).toBe(true);
      const before = await inspector.pTTL(`${prefix}:rate:v1:shared`);
      expect((await first.consume('shared')).allowed).toBe(false);
      expect(
        await inspector.pTTL(`${prefix}:rate:v1:shared`),
      ).toBeLessThanOrEqual(before);
      expect((await second.consume('separate')).allowed).toBe(true);
      await expect
        .poll(() => inspector.exists(`${prefix}:rate:v1:shared`), {
          timeout: 3_000,
        })
        .toBe(0);
      expect((await second.consume('shared')).remaining).toBe(4);
      // Lost TTL/corrupt counter must not silently grant a new allowance.
      await inspector.set(`${prefix}:rate:v1:broken`, '1');
      await expect(first.consume('broken')).rejects.toThrow(
        'temporarily unavailable',
      );
      await inspector.del(`${prefix}:rate:v1:broken`);
    } finally {
      first.onApplicationShutdown();
      second.onApplicationShutdown();
      inspector.destroy();
    }
  });

  it('uses shared limits in two independent Nest applications', async () => {
    const options = {
      apiKey: 'redis-http-test',
      logger: false as const,
      redisUrl: url!,
      redisPrefix: `http-${randomUUID()}`,
      rateLimitMaxRequests: 2,
      quotasEnabled: false,
    };
    const first = await createApiApplication(options);
    const second = await createApiApplication(options);
    const request = {
      method: 'POST' as const,
      url: '/v1/text/normalize',
      headers: { authorization: 'Bearer redis-http-test' },
      payload: { text: 'က' },
    };
    try {
      // 503 before connection readiness spends no allowance.
      await expect
        .poll(
          async () =>
            (await first.inject({ method: 'GET', url: '/v1/health/ready' }))
              .statusCode,
          { timeout: 5_000 },
        )
        .toBe(200);
      await expect
        .poll(async () => (await first.inject(request)).statusCode)
        .toBe(200);
      await expect
        .poll(async () => (await second.inject(request)).statusCode)
        .toBe(200);
      const denied = await first.inject(request);
      expect(denied.statusCode).toBe(429);
      expect(denied.json().code).toBe('rate_limited');
      expect(denied.headers['ratelimit-remaining']).toBe('0');
      expect(Number(denied.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  });
});

it('fails closed without Redis and leaves public health available', async () => {
  const app = await createApiApplication({
    apiKey: 'outage-test',
    redisUrl: 'redis://127.0.0.1:1',
    logger: false,
    quotasEnabled: false,
  });
  try {
    const readiness = await app.inject({
      method: 'GET',
      url: '/v1/health/ready',
    });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({ status: 'not_ready' });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/text/normalize',
        headers: { authorization: 'Bearer outage-test' },
        payload: { text: 'က' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('service_unavailable');
      expect(response.body).not.toContain('127.0.0.1');
    }
    expect(
      (await app.inject({ method: 'GET', url: '/v1/health' })).statusCode,
    ).toBe(200);
  } finally {
    await app.close();
  }
});
