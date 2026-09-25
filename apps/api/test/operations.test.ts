import 'reflect-metadata';
import { performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { createApiApplication } from '../src/create-api-application.js';
import { ReadinessService } from '../src/modules/health/readiness.service.js';
import { DatabaseReadinessProbe } from '../src/infrastructure/database/database-readiness.probe.js';
import { MetricsService } from '../src/modules/operations/metrics.service.js';

const token = 'test-operator-token-0123456789-abcdefghijklmnopqrstuvwxyz';

describe('dependency readiness', () => {
  it('gates startup/shutdown and shares, caches, and recovers probe runs', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    let resolve!: (ready: boolean) => void;
    const probe = {
      checkReady: vi.fn(
        () =>
          new Promise<boolean>((done) => {
            resolve = done;
          }),
      ),
    };
    const service = new ReadinessService([probe]);
    try {
      expect(await service.isReady()).toBe(false);
      service.onApplicationBootstrap();
      const first = service.isReady();
      const second = service.isReady();
      expect(probe.checkReady).toHaveBeenCalledTimes(1);
      resolve(false);
      expect(await first).toBe(false);
      expect(await second).toBe(false);
      expect(await service.isReady()).toBe(false);
      expect(probe.checkReady).toHaveBeenCalledTimes(1);
      now.mockReturnValue(1_001);
      const recovered = service.isReady();
      resolve(true);
      expect(await recovered).toBe(true);
      service.beforeApplicationShutdown();
      expect(await service.isReady()).toBe(false);
    } finally {
      now.mockRestore();
    }
  });

  it('fails closed on exceptions and shutdown during an in-flight probe', async () => {
    const failed = new ReadinessService([
      { checkReady: () => Promise.reject(new Error('secret-url')) },
    ]);
    failed.onApplicationBootstrap();
    expect(await failed.isReady()).toBe(false);
    let resolve!: (ready: boolean) => void;
    const service = new ReadinessService([
      {
        checkReady: () =>
          new Promise<boolean>((done) => {
            resolve = done;
          }),
      },
    ]);
    service.onApplicationBootstrap();
    const result = service.isReady();
    service.beforeApplicationShutdown();
    resolve(true);
    expect(await result).toBe(false);
  });

  it('does not require PostgreSQL in NLP-only mode', async () => {
    const probe = new DatabaseReadinessProbe(undefined);
    expect(await probe.checkReady()).toBe(true);
    await probe.onApplicationShutdown();
  });

  it('keeps liveness available during a database outage without leaking diagnostics', async () => {
    const app = await createApiApplication({
      apiKey: 'test',
      databaseUrl: 'postgresql://private:private@127.0.0.1:1/private',
      logger: false,
      quotasEnabled: false,
    });
    try {
      const ready = await app.inject({
        method: 'GET',
        url: '/v1/health/ready',
      });
      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toEqual({ status: 'not_ready' });
      expect(ready.headers['cache-control']).toBe('private, no-store');
      expect(
        (await app.inject({ method: 'GET', url: '/v1/health' })).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
});

describe('operator metrics', () => {
  it('leaves the endpoint absent when disabled and readiness independent of authentication', async () => {
    vi.stubEnv('MYANLEX_METRICS_TOKEN', undefined);
    const app = await createApiApplication({ apiKey: 'test', logger: false });
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/internal/metrics' }))
          .statusCode,
      ).toBe(404);
      const ready = await app.inject({
        method: 'GET',
        url: '/v1/health/ready',
      });
      expect(ready.statusCode).toBe(200);
      expect(ready.json()).toEqual({ status: 'ready' });
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });

  it('counts aborted bodies without treating them as completed requests', async () => {
    const metrics = new MetricsService(token);
    metrics.observe({
      event: 'http_request_aborted',
      requestId: 'private-id',
      method: 'POST',
      route: '/v1/tokenize',
      statusCode: null,
      durationMs: 3,
    });
    const body = await metrics.registry.metrics();
    expect(body).toContain(
      'myanlex_http_requests_aborted_total{method="POST",route="/v1/tokenize"} 1',
    );
    expect(body).not.toContain('private-id');
    expect(body).not.toContain('myanlex_http_requests_total{');
  });
  it('is disabled without a configured operator token', () => {
    const metrics = new MetricsService(undefined);
    expect(metrics.enabled).toBe(false);
    expect(metrics.authorize(`Bearer ${token}`)).toBe(false);
  });

  it('requires the separate token and records bounded, private labels independently of log exporters', async () => {
    const app = await createApiApplication({
      apiKey: 'private-api-key',
      metricsToken: token,
      logger: false,
      rateLimitMaxRequests: 1,
      requestLogSink: () => {
        throw new Error('broken sink');
      },
    });
    const other = new MetricsService(token);
    try {
      for (const authorization of [
        '',
        'Bearer private-api-key',
        `Bearer ${token}x`,
      ]) {
        expect(
          (
            await app.inject({
              method: 'GET',
              url: '/internal/metrics',
              headers: { authorization },
            })
          ).statusCode,
        ).toBe(401);
      }
      const request = {
        method: 'POST' as const,
        url: '/v1/text/normalize?token=private-query',
        headers: { authorization: 'Bearer private-api-key' },
        payload: { text: 'private-body' },
      };
      expect((await app.inject(request)).statusCode).toBe(200);
      expect((await app.inject(request)).statusCode).toBe(429);
      await app.inject({ method: 'GET', url: '/private-path' });
      await app.inject({ method: 'GET', url: '/v1/health' });
      const response = await app.inject({
        method: 'GET',
        url: '/internal/metrics',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/plain');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toContain(
        'myanlex_http_requests_total{method="POST",route="/v1/text/normalize",status_code="200"} 1',
      );
      expect(response.body).toContain('status_code="429"} 1');
      expect(response.body).toContain('route="unmatched"');
      expect(response.body).toContain(
        'myanlex_http_request_duration_seconds_bucket',
      );
      expect(response.body).toContain('myanlex_process_resident_memory_bytes');
      expect(response.body).not.toContain('private-');
      expect(response.body).not.toContain(token);
      expect(response.body).not.toContain('requestId');
      expect(response.body).not.toContain('route="/internal/metrics"');
      expect(response.body).not.toContain('route="/v1/health"');
      expect(await other.registry.metrics()).not.toContain(
        'route="/v1/text/normalize"',
      );
    } finally {
      await app.close();
    }
  });
});
