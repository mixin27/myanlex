import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import { MyanLex, MyanLexApiError, MyanLexRequestError } from '../src/index.js';
import { parseRetryAfter } from '../src/errors.js';
import type { NormalizationResult } from '../src/index.js';

const key = 'test-private-key';
const json = (value: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

describe('MyanLex SDK transport', () => {
  it('sends explicit operations as JSON without modifying Unicode text', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        input: 'က😀',
        output: 'က😀',
        changed: false,
        profile: 'unicode-nfc',
      }),
    );
    const client = new MyanLex({
      apiKey: key,
      baseUrl: 'http://localhost:3001/proxy/v1/',
      fetch,
    });
    const result = await client.normalize({ text: 'က😀' });
    expectTypeOf(result).toEqualTypeOf<NormalizationResult>();
    expect(result.output).toBe('က😀');
    const [url, options] = fetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:3001/proxy/v1/text/normalize');
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'က😀' }),
      redirect: 'error',
      credentials: 'omit',
    });
    expect(JSON.stringify(client)).not.toContain(key);
  });

  it('maps every language operation to the published OpenAPI route', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({}));
    const client = new MyanLex({ apiKey: key, fetch });
    const cases = [
      ['text/detect', () => client.detect({ text: 'က' })],
      ['text/normalize', () => client.normalize({ text: 'က' })],
      [
        'text/convert',
        () => client.convert({ text: 'က', from: 'zawgyi', to: 'unicode' }),
      ],
      ['syllabify', () => client.syllabify({ text: 'က' })],
      ['orthography/validate', () => client.validateOrthography({ text: 'က' })],
      [
        'transliterate',
        () => client.transliterate({ text: 'က', scheme: 'ala-lc-2011' }),
      ],
      ['tokenize', () => client.tokenize({ text: 'က' })],
      [
        'batch/syllabify',
        () => client.batchSyllabify({ items: [{ id: 'a', text: 'က' }] }),
      ],
      [
        'batch/transliterate',
        () =>
          client.batchTransliterate({
            items: [{ id: 'a', text: 'က' }],
            scheme: 'ala-lc-2011',
          }),
      ],
    ] as const;
    const contract = readFileSync(
      new URL('../../../openapi/openapi.yaml', import.meta.url),
      'utf8',
    );
    for (const [path, call] of cases) {
      await call();
      expect(fetch.mock.lastCall?.[0]).toBe(
        `https://api.myanlex.dev/v1/${path}`,
      );
      expect(contract).toContain(`  /${path}:\n    post:`);
    }
  });

  it('calls health without attaching credentials', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(json({ status: 'ok', version: 'test' }));
    expect(await new MyanLex({ apiKey: key, fetch }).health()).toMatchObject({
      status: 'ok',
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    expect(fetch.mock.calls[0]?.[1].headers).not.toHaveProperty(
      'authorization',
    );
  });

  it('preserves batch order and item failures without turning them into HTTP errors', async () => {
    const value = {
      results: [
        {
          id: 'b',
          success: false,
          error: { code: 'invalid_unicode', message: 'Invalid text' },
        },
        {
          id: 'a',
          success: true,
          result: {
            input: 'က',
            profile: 'burmese-orthographic-v1',
            segments: [],
          },
        },
      ],
    };
    const client = new MyanLex({ apiKey: key, fetch: async () => json(value) });
    expect(
      await client.batchSyllabify({
        items: [
          { id: 'b', text: '\ud800' },
          { id: 'a', text: 'က' },
        ],
      }),
    ).toEqual(value);
  });

  it.each([401, 403, 413, 429, 503])(
    'exposes typed HTTP %i errors without retries',
    async (status) => {
      const fetch = vi.fn().mockImplementation(async () =>
        json(
          {
            status: 999,
            code: 'quota_exceeded',
            requestId: 'request-123',
            detail: 'Server detail',
          },
          status,
          { 'retry-after': '60' },
        ),
      );
      const client = new MyanLex({ apiKey: key, fetch });
      await expect(
        client.normalize({ text: 'private text' }),
      ).rejects.toMatchObject({
        name: 'MyanLexApiError',
        status,
        code: 'quota_exceeded',
        requestId: 'request-123',
        retryAfterSeconds: 60,
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it('retains HTTP status for non-JSON and malformed problem errors without exposing raw bodies', async () => {
    const client = new MyanLex({
      apiKey: key,
      fetch: async () => new Response(`private text ${key}`, { status: 502 }),
    });
    try {
      await client.normalize({ text: 'private text' });
      throw new Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(MyanLexApiError);
      expect(error).toMatchObject({ status: 502, problem: undefined });
      expect(String(error)).not.toContain(key);
      expect(String(error)).not.toContain('private text');
    }
  });

  it.each(['not json', 'null', '[]', '1'])(
    'rejects invalid success response %s',
    async (body) => {
      const client = new MyanLex({
        apiKey: key,
        fetch: async () =>
          new Response(body, {
            headers: { 'content-type': 'application/json' },
          }),
      });
      await expect(client.normalize({ text: '' })).rejects.toMatchObject({
        kind: 'invalid_response',
      });
    },
  );

  it('sanitizes transport failures, including redirect failures', async () => {
    const client = new MyanLex({
      apiKey: key,
      fetch: async () => {
        throw new Error(`private text ${key}`);
      },
    });
    await expect(client.normalize({ text: 'private text' })).rejects.toEqual(
      new MyanLexRequestError('transport_failure'),
    );
  });

  it('does not dispatch already-aborted calls', async () => {
    const fetch = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(
      new MyanLex({ apiKey: key, fetch }).normalize(
        { text: '' },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ kind: 'aborted' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cancels in-flight calls and removes abort listeners', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init.signal!.addEventListener('abort', () =>
            reject(new Error('aborted')),
          ),
        ),
    );
    const pending = new MyanLex({ apiKey: key, fetch }).normalize(
      { text: '' },
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('times out even while reading a response body and never retries', async () => {
    const fetch = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              init.signal!.addEventListener('abort', () =>
                controller.error(new Error('aborted')),
              );
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    await expect(
      new MyanLex({ apiKey: key, fetch, timeoutMs: 10 }).normalize({
        text: '',
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    'http://example.com/v1',
    'https://user:secret@example.com/v1',
    'https://example.com/v1?key=secret',
    'https://example.com/v1#secret',
    'invalid',
  ])('rejects unsafe base URLs: %s', (baseUrl) => {
    expect(() => new MyanLex({ apiKey: key, baseUrl })).toThrow(TypeError);
  });
  it.each([0, -1, 1.5, Infinity, 2147483648])(
    'rejects invalid timeouts: %s',
    (timeoutMs) => {
      expect(() => new MyanLex({ apiKey: key, timeoutMs })).toThrow(TypeError);
    },
  );
  it.each(['', ' ', 'key\nsecret'])(
    'rejects invalid keys without repeating them',
    (apiKey) => {
      expect(() => new MyanLex({ apiKey })).toThrow(TypeError);
    },
  );
  it('parses Retry-After dates, zero, and invalid headers safely', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', now)).toBe(60);
    expect(parseRetryAfter('0', now)).toBe(0);
    for (const value of [null, '-1', '1.5', 'bad', '9999999999999999999999999'])
      expect(parseRetryAfter(value, now)).toBeUndefined();
  });
});
