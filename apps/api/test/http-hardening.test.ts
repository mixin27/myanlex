import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from '../src/create-api-application.js';
import type { RequestLogRecord } from '../src/common/http/request-observability.js';

describe('HTTP hardening', () => {
  let application: NestFastifyApplication;
  const records: RequestLogRecord[] = [];

  beforeAll(async () => {
    application = await createApiApplication({
      apiKey: 'private-api-key',
      logger: false,
      requestLogSink: (record) => records.push(record),
    });
  });
  afterAll(async () => {
    await application.close();
  });

  it('generates correlation IDs and logs only allowlisted request metadata', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/v1/text/normalize?token=private-query',
      headers: {
        authorization: 'Bearer private-api-key',
        cookie: 'session=private-cookie',
        'x-request-id': 'private-client-id',
      },
      payload: { text: 'private-submitted-text' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const record = records.find(
      (item) => item.requestId === response.headers['x-request-id'],
    );
    expect(record).toEqual({
      event: 'http_request_completed',
      requestId: response.headers['x-request-id'],
      method: 'POST',
      route: '/v1/text/normalize',
      statusCode: 200,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(record)).not.toContain('private-');
    const second = await application.inject({
      method: 'GET',
      url: '/v1/health',
    });
    expect(second.headers['x-request-id']).not.toBe(
      response.headers['x-request-id'],
    );
  });

  it.each([
    { url: '/v1/health', method: 'GET' as const, status: 200 },
    {
      url: '/private-path?token=private-token',
      method: 'GET' as const,
      status: 404,
    },
    { url: '/v1/tokenize', method: 'POST' as const, status: 401 },
  ])(
    'protects JSON responses with status $status',
    async ({ url, method, status }) => {
      const response = await application.inject({
        method,
        url,
        headers: { origin: 'https://untrusted.example' },
      });
      expect(response.statusCode).toBe(status);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(response.headers['permissions-policy']).toContain('camera=()');
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
      const record = records.find(
        (item) => item.requestId === response.headers['x-request-id'],
      );
      expect(record?.statusCode).toBe(status);
      expect(JSON.stringify(record)).not.toContain('private-');
    },
  );

  it('records parser failures without recording payloads', async () => {
    for (const payload of [
      '{"private-secret":',
      JSON.stringify({ text: 'x'.repeat(1_048_576) }),
    ]) {
      const response = await application.inject({
        method: 'POST',
        url: '/v1/tokenize',
        headers: { 'content-type': 'application/json' },
        payload,
      });
      expect([400, 413]).toContain(response.statusCode);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(
        records.find(
          (item) => item.requestId === response.headers['x-request-id'],
        )?.statusCode,
      ).toBe(response.statusCode);
    }
    expect(JSON.stringify(records)).not.toContain('private-secret');
  });

  it('uses the auth route template instead of a token-bearing path', async () => {
    const response = await application.inject({
      method: 'GET',
      url: '/api/auth/reset-password/private-reset-token?token=private-query',
    });
    const record = records.find(
      (item) => item.requestId === response.headers['x-request-id'],
    );
    expect(record?.route).toBe('/api/auth/*');
    expect(JSON.stringify(record)).not.toContain('private-');
  });

  it.each(['/swagger', '/docs'])(
    'keeps documentation HTML available at %s',
    async (url) => {
      const response = await application.inject({ method: 'GET', url });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(
        records.find(
          (record) => record.requestId === response.headers['x-request-id'],
        )?.route,
      ).toBe(url);
      expect(response.headers['content-security-policy']).not.toContain(
        "default-src 'none'",
      );
    },
  );

  it('does not fail requests when the logging sink throws', async () => {
    const app = await createApiApplication({
      apiKey: 'test',
      logger: false,
      requestLogSink: () => {
        throw new Error('exporter failed');
      },
    });
    try {
      expect(
        (await app.inject({ method: 'GET', url: '/v1/health' })).statusCode,
      ).toBe(200);
    } finally {
      await app.close();
    }
  });
});
