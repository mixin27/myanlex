import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { log } from 'node:console';
import { URL } from 'node:url';

assert.equal(
  process.env.MYANLEX_STAGING_ACK,
  'I own this staging target',
  'Explicit staging authorization is required. Never target production.',
);
const target = new URL(process.env.MYANLEX_STAGING_URL);
assert.ok(
  !target.username &&
    !target.password &&
    !target.search &&
    !target.hash &&
    target.pathname === '/',
  'Supply an origin only, without credentials, path or query.',
);
assert.ok(
  target.protocol === 'https:' ||
    (target.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)),
  'Use HTTPS except for loopback targets.',
);
const key = process.env.MYANLEX_STAGING_API_KEY;
assert.ok(
  key,
  'A disposable staging key with text.normalize permission is required.',
);
const durations = [];
const statuses = {};
let stopped = false;
process.once('SIGINT', () => {
  stopped = true;
});
process.once('SIGTERM', () => {
  stopped = true;
});
const started = performance.now();
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let i = 0; i < 50 && !stopped; i += 1) {
      const before = performance.now();
      try {
        const response = await globalThis.fetch(
          new URL('/v1/text/normalize', target),
          {
            method: 'POST',
            redirect: 'error',
            signal: globalThis.AbortSignal.timeout(5_000),
            headers: {
              authorization: `Bearer ${key}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ text: 'က😀'.repeat(100) }),
          },
        );
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        const body = await response.json();
        if (response.status !== 200 || body.output !== 'က😀'.repeat(100))
          stopped = true;
      } catch {
        statuses.transport_error = (statuses.transport_error ?? 0) + 1;
        stopped = true;
      }
      durations.push(performance.now() - before);
    }
  }),
);
durations.sort((a, b) => a - b);
log(
  JSON.stringify(
    {
      mode: 'authorized-staging',
      node: process.version,
      concurrency: 4,
      attempted: durations.length,
      statuses,
      durationMs: Math.round(performance.now() - started),
      p95Ms: Math.round(durations[Math.ceil(durations.length * 0.95) - 1] ?? 0),
    },
    null,
    2,
  ),
);
if (stopped || statuses[200] !== 200) process.exitCode = 1;
