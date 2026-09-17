import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApiApplication } from '../src/create-api-application.js';

const API_KEY = 'integration-test-key';

describe('MyanLex HTTP API', () => {
  let application: NestFastifyApplication;

  beforeAll(async () => {
    application = await createApiApplication({
      apiKey: API_KEY,
      logger: false,
      serviceVersion: 'test',
    });
  });

  afterAll(async () => {
    await application.close();
  });

  it('serves the public health endpoint under /v1', async () => {
    const response = await application.inject({
      method: 'GET',
      url: '/v1/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: 'test' });
  });

  it('requires a bearer API key for language operations', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/v1/tokenize',
      payload: { text: 'က' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json()).toMatchObject({
      type: 'about:blank',
      status: 401,
      code: 'unauthorized',
    });
  });

  const cases = [
    {
      name: 'detection',
      url: '/v1/text/detect',
      payload: { text: 'မြန်မာ' },
      expected: { encoding: 'unicode', profile: 'zawgyi-unicode-v1' },
    },
    {
      name: 'normalization',
      url: '/v1/text/normalize',
      payload: { text: 'က့်' },
      expected: { output: 'က့်', profile: 'unicode-nfc' },
    },
    {
      name: 'conversion',
      url: '/v1/text/convert',
      payload: { text: 'ျမန္မာ', from: 'zawgyi', to: 'unicode' },
      expected: { output: 'မြန်မာ', profile: 'cldr-zawgyi-v1' },
    },
    {
      name: 'syllabification',
      url: '/v1/syllabify',
      payload: { text: 'မြန်မာ' },
      expected: { profile: 'burmese-orthographic-v1' },
    },
    {
      name: 'orthography validation',
      url: '/v1/orthography/validate',
      payload: { text: 'က' },
      expected: { valid: true, profile: 'burmese-orthography-v1' },
    },
    {
      name: 'transliteration',
      url: '/v1/transliterate',
      payload: { text: 'က', scheme: 'ala-lc-2011' },
      expected: { output: 'ka', profile: 'ala-lc-2011-mapping-v1' },
    },
    {
      name: 'tokenization',
      url: '/v1/tokenize',
      payload: { text: 'Aက' },
      expected: { mixedScript: true, scripts: ['latin', 'myanmar'] },
    },
  ] as const;

  it.each(cases)('implements $name', async ({ url, payload, expected }) => {
    const response = await application.inject({
      method: 'POST',
      url,
      headers: { authorization: `Bearer ${API_KEY}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(expected);
  });

  it('rejects unknown request properties', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/v1/tokenize',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: { text: 'က', normalize: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });

  it('maps malformed JSON to a bad-request problem', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/v1/tokenize',
      headers: {
        authorization: `Bearer ${API_KEY}`,
        'content-type': 'application/json',
      },
      payload: '{"text":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    expect(response.json()).toMatchObject({
      status: 400,
      code: 'invalid_request',
    });
  });

  it('maps the code-point input limit to an RFC 9457 problem', async () => {
    const response = await application.inject({
      method: 'POST',
      url: '/v1/text/normalize',
      headers: { authorization: `Bearer ${API_KEY}` },
      payload: { text: 'က'.repeat(100_001) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      status: 413,
      code: 'text_too_long',
    });
  });
});
