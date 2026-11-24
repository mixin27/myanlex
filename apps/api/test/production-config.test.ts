import 'reflect-metadata';

import { FastifyAdapter } from '@nestjs/platform-fastify';
import { describe, expect, it } from 'vitest';

import { createApiApplication } from '../src/create-api-application.js';
import {
  isProduction,
  productionConfigProblems,
} from '../src/common/runtime/production-config.js';
import { parseTrustProxy } from '../src/common/runtime/trust-proxy.js';
import { validateEnvironment } from '../src/common/runtime/runtime-config.module.js';

const good = {
  MYANLEX_ENV: 'production',
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app:secret-password@postgres:5432/myanlex',
  REDIS_URL: 'redis://redis:6379',
  MYANLEX_QUOTAS_ENABLED: 'true',
  MYANLEX_METRICS_TOKEN: 'm'.repeat(40),
  AUTH_ENABLED: 'true',
  AUTH_SECRET: 's'.repeat(40),
  AUTH_PUBLIC_URL: 'https://console.example.com',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_FROM: 'MyanLex <no-reply@example.com>',
  MYANLEX_BILLING_PAYMENT_INSTRUCTIONS: 'Bank transfer to account 000',
};

describe('production configuration', () => {
  it('accepts a complete production configuration', () => {
    expect(isProduction(good)).toBe(true);
    expect(productionConfigProblems(good)).toEqual([]);
  });

  it('names each problem without echoing values', () => {
    const problems = productionConfigProblems({
      ...good,
      NODE_ENV: 'development',
      DATABASE_URL: `${good.DATABASE_URL}?sslmode=disable`,
      REDIS_URL: '',
      MYANLEX_QUOTAS_ENABLED: 'false',
      MYANLEX_API_KEY: 'bootstrap-key-value',
      AUTH_SECRET: 'short-secret-value',
      AUTH_PUBLIC_URL: 'http://console.example.com',
      SMTP_HOST: undefined,
      MYANLEX_BILLING_PAYMENT_INSTRUCTIONS: ' ',
    });
    expect(problems.map((problem) => problem.variable)).toEqual([
      'NODE_ENV',
      'DATABASE_URL',
      'REDIS_URL',
      'MYANLEX_QUOTAS_ENABLED',
      'MYANLEX_API_KEY',
      'AUTH_SECRET',
      'AUTH_PUBLIC_URL',
      'SMTP_HOST',
      'MYANLEX_BILLING_PAYMENT_INSTRUCTIONS',
    ]);
    const text = JSON.stringify(problems);
    for (const secret of [
      'secret-password',
      'bootstrap-key-value',
      'short-secret-value',
    ])
      expect(text).not.toContain(secret);
  });

  it('rejects a localhost public URL', () => {
    expect(
      productionConfigProblems({
        ...good,
        AUTH_PUBLIC_URL: 'https://localhost:3000',
      }).map((problem) => problem.variable),
    ).toEqual(['AUTH_PUBLIC_URL']);
  });

  it('only applies when MYANLEX_ENV is production', () => {
    expect(isProduction({ MYANLEX_ENV: 'staging' })).toBe(false);
    expect(isProduction({})).toBe(false);
  });

  it('makes the API configuration invalid in production with missing settings', () => {
    expect(() =>
      validateEnvironment(
        { MYANLEX_ENV: 'production', MYANLEX_API_KEY: 'k' },
        {},
      ),
    ).toThrow(
      /Invalid production configuration: .*MYANLEX_API_KEY must not be set/,
    );
    expect(() => validateEnvironment(good, {})).not.toThrow();
    expect(() =>
      validateEnvironment({ MYANLEX_API_KEY: 'k', NODE_ENV: 'test' }, {}),
    ).not.toThrow();
  });
});

describe('MYANLEX_TRUST_PROXY', () => {
  it('parses off and address ranges', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
    expect(parseTrustProxy('10.0.0.0/8, 172.16.0.0/12,::1')).toBe(
      '10.0.0.0/8,172.16.0.0/12,::1',
    );
  });

  it('refuses trusting everyone and malformed input', () => {
    for (const value of [
      'true',
      '1',
      '2',
      '10.0.0.0/33',
      '::1/129',
      'proxy.example',
      '10.0.0.1/8/1',
      '10.0.0.0/8,',
    ])
      expect(() => parseTrustProxy(value), value).toThrow(
        /MYANLEX_TRUST_PROXY/,
      );
  });

  it('uses the forwarded client address only when trusted', async () => {
    const ipFor = async (setting: string | undefined) => {
      const server = new FastifyAdapter({
        trustProxy: parseTrustProxy(setting),
      }).getInstance();
      server.get('/', (request) => ({ ip: request.ip }));
      const response = await server.inject({
        url: '/',
        remoteAddress: '10.0.0.2',
        headers: { 'x-forwarded-for': '203.0.113.9, 198.51.100.7' },
      });
      await server.close();
      return (response.json() as { ip: string }).ip;
    };
    expect(await ipFor(undefined)).toBe('10.0.0.2');
    // Traefik on the Docker network, Cloudflare in front of it.
    expect(await ipFor('10.0.0.0/8')).toBe('198.51.100.7');
    expect(await ipFor('10.0.0.0/8,198.51.100.0/24')).toBe('203.0.113.9');
  });

  it('refuses an invalid setting when the API starts', async () => {
    await expect(
      createApiApplication({
        apiKey: 'k',
        logger: false,
        trustProxy: 'true',
      }),
    ).rejects.toThrow(/MYANLEX_TRUST_PROXY/);
  });
});
