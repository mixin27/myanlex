import type {
  FetchTransport,
  MyanLexOptions,
  RequestOptions,
} from './contracts.js';
import {
  MyanLexApiError,
  MyanLexRequestError,
  parseProblem,
  parseRetryAfter,
} from './errors.js';

function baseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TypeError('Provide a valid versioned API baseUrl.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new TypeError(
      'baseUrl requires HTTPS (HTTP is allowed on loopback), without credentials, query, or fragment.',
    );
  return url.toString().replace(/\/+$/, '');
}

export class HttpTransport {
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: FetchTransport;

  constructor(options: MyanLexOptions) {
    if (
      typeof options.apiKey !== 'string' ||
      !options.apiKey.trim() ||
      /[^\x21-\x7e]/.test(options.apiKey)
    )
      throw new TypeError(
        'Provide a non-empty ASCII API key without whitespace.',
      );
    this.#apiKey = options.apiKey;
    this.#baseUrl = baseUrl(options.baseUrl ?? 'https://api.myanlex.dev/v1');
    this.#timeoutMs = options.timeoutMs ?? 30_000;
    if (
      !Number.isInteger(this.#timeoutMs) ||
      this.#timeoutMs < 1 ||
      this.#timeoutMs > 2_147_483_647
    )
      throw new TypeError(
        'timeoutMs must be an integer between 1 and 2147483647.',
      );
    this.#fetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof this.#fetch !== 'function')
      throw new TypeError('Provide a fetch implementation in this runtime.');
  }

  async request<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    if (options.signal?.aborted) throw new MyanLexRequestError('aborted');
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);
    try {
      const response = await this.#fetch(`${this.#baseUrl}/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers:
          body === undefined
            ? { accept: 'application/json' }
            : {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Bearer ${this.#apiKey}`,
              },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
        redirect: 'error',
        credentials: 'omit',
      });
      const raw = await response.text();
      if (controller.signal.aborted)
        throw new MyanLexRequestError(timedOut ? 'timeout' : 'aborted');
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        value = undefined;
      }
      if (!response.ok)
        throw new MyanLexApiError(
          response.status,
          parseProblem(value),
          parseRetryAfter(response.headers.get('retry-after')),
        );
      if (
        !response.headers
          .get('content-type')
          ?.toLowerCase()
          .includes('application/json') ||
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value)
      )
        throw new MyanLexRequestError('invalid_response');
      return value as T;
    } catch (error) {
      if (
        error instanceof MyanLexApiError ||
        error instanceof MyanLexRequestError
      )
        throw error;
      throw new MyanLexRequestError(
        timedOut
          ? 'timeout'
          : controller.signal.aborted
            ? 'aborted'
            : 'transport_failure',
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }
}
