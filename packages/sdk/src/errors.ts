import type { ApiProblem } from './contracts.js';

/** The HTTP status is authoritative, even if the server's problem body disagrees. */
export class MyanLexApiError extends Error {
  override readonly name = 'MyanLexApiError';
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  constructor(
    readonly status: number,
    readonly problem: ApiProblem | undefined,
    readonly retryAfterSeconds: number | undefined,
  ) {
    // Do not put request text, credentials, URLs, or raw response content in messages.
    super(`MyanLex API returned HTTP ${status}.`);
    this.code = problem?.code;
    this.requestId = problem?.requestId;
  }
}

export type RequestFailure =
  'aborted' | 'timeout' | 'transport_failure' | 'invalid_response';
export class MyanLexRequestError extends Error {
  override readonly name = 'MyanLexRequestError';
  constructor(readonly kind: RequestFailure) {
    super(`MyanLex request failed: ${kind}.`);
  }
}

export function parseProblem(value: unknown): ApiProblem | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return undefined;
  const source = value as Record<string, unknown>;
  const result: Record<string, string | number> = {};
  for (const key of [
    'type',
    'title',
    'code',
    'detail',
    'instance',
    'requestId',
  ]) {
    if (typeof source[key] === 'string') result[key] = source[key];
  }
  if (typeof source.status === 'number' && Number.isInteger(source.status))
    result.status = source.status;
  return Object.keys(result).length ? result : undefined;
}

export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number | undefined {
  if (value === null) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  // Require the HTTP-date form rather than Date.parse's permissive numeric dates.
  if (
    !/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(
      value,
    )
  )
    return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - now) / 1000))
    : undefined;
}
