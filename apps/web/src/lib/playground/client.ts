import { runSchema } from '@myanlex/playground';
import type { Run } from '@myanlex/playground';

export class PlaygroundHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
    readonly retryAfter?: string,
  ) {
    super(
      code === 'encoding_mixed' ||
        code === 'encoding_mismatch' ||
        code === 'encoding_uncertain'
        ? 'Source encoding is mixed, mismatched or uncertain. Inspect detection evidence and preserve the original before conversion.'
        : status === 401
          ? 'Your session expired. Sign in again.'
          : status === 403
            ? 'Your account lacks the required permissions or verification.'
            : status === 404
              ? 'This project or saved run is inaccessible or expired.'
              : status === 429
                ? `${code === 'quota_exceeded' ? 'Organization quota exhausted.' : 'Request limit reached.'} Retry explicitly after the allowance resets.`
                : status === 413
                  ? 'The request is too large. Export large runs instead of saving.'
                  : status === 409
                    ? 'The saved-run limit or save identifier conflicts. Delete a run or use a new save.'
                    : status >= 500
                      ? 'The service is unavailable. Retry explicitly.'
                      : 'The request could not be processed.',
    );
  }
}
export async function playgroundFetch<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/v1/platform/${path}`, {
    method,
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
    signal: signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new PlaygroundHttpError(
      response.status,
      typeof problem?.code === 'string' ? problem.code : 'request_failed',
      typeof problem?.requestId === 'string' ? problem.requestId : undefined,
      response.headers.get('Retry-After') ?? undefined,
    );
  }
  return response.json() as Promise<T>;
}
export function parseRun(value: unknown): Run {
  const parsed = runSchema.safeParse(value);
  if (!parsed.success) throw new Error('invalid_response');
  return parsed.data as Run;
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
