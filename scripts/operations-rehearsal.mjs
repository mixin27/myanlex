import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { setTimeout } from 'node:timers/promises';
import process from 'node:process';
import { log } from 'node:console';
import { URL } from 'node:url';

// No supplied URLs/container names: this destructive rehearsal owns every target.
process.env.NODE_ENV = 'test';
process.env.AUTH_ENABLED = 'false';
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
delete process.env.MYANLEX_METRICS_TOKEN;
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
require('reflect-metadata');
const { createApiApplication } =
  await import('../apps/api/dist/create-api-application.js');
const owned = [];
let interrupted = false;
process.once('SIGINT', () => {
  interrupted = true;
});
process.once('SIGTERM', () => {
  interrupted = true;
});
const docker = (...args) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
function start(image, port, extra = []) {
  const id = docker(
    'run',
    '--rm',
    '-d',
    '--name',
    `myanlex-rehearsal-${randomUUID()}`,
    '-p',
    `127.0.0.1::${port}`,
    ...extra,
    image,
  );
  assert.match(id, /^[a-f0-9]{64}$/);
  owned.push(id);
  const mapped = docker('port', id, `${port}/tcp`);
  assert.match(mapped, /^127\.0\.0\.1:\d+$/);
  return { id, address: mapped };
}
async function until(check, description) {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if (interrupted) throw new Error('Rehearsal interrupted.');
    if (await check()) return;
    await setTimeout(300);
  }
  throw new Error(`Timed out: ${description}`);
}

let app;
try {
  const pg = start('postgres:18.6-alpine', 5432, [
    '-e',
    'POSTGRES_USER=myanlex',
    '-e',
    'POSTGRES_PASSWORD=test-only',
    '-e',
    'POSTGRES_DB=rehearsal',
  ]);
  const redis = start('redis:8.10.1-alpine', 6379);
  const apiKey = randomUUID();
  const metricsToken = randomUUID();
  app = await createApiApplication({
    databaseUrl: `postgresql://myanlex:test-only@${pg.address}/rehearsal`,
    redisUrl: `redis://${redis.address}`,
    apiKey,
    metricsToken,
    logger: false,
    quotasEnabled: false,
    rateLimitMaxRequests: 1_000,
  });
  await app.listen(0, '127.0.0.1');
  const origin = await app.getUrl();
  async function request(path, options) {
    if (interrupted) throw new Error('Rehearsal interrupted.');
    const response = await globalThis.fetch(`${origin}${path}`, {
      ...options,
      signal: globalThis.AbortSignal.timeout(5_000),
    });
    return { status: response.status, body: await response.text() };
  }
  const ready = async (status) =>
    (await request('/v1/health/ready')).status === status;
  const language = () =>
    request('/v1/text/normalize', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ text: 'က😀'.repeat(100) }),
    });
  await until(() => ready(200), 'initial readiness');
  log('Rehearsal: initial readiness passed; starting local load.');
  const times = [];
  const started = performance.now();
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (let i = 0; i < 50; i += 1) {
        const before = performance.now();
        const response = await language();
        assert.equal(response.status, 200);
        assert.equal(JSON.parse(response.body).output, 'က😀'.repeat(100));
        times.push(performance.now() - before);
      }
    }),
  );
  const durationMs = performance.now() - started;
  times.sort((a, b) => a - b);
  const recoveries = [];
  for (const dependency of [redis, pg]) {
    log(`Rehearsal: pausing ${dependency === redis ? 'Redis' : 'PostgreSQL'}.`);
    docker('pause', dependency.id);
    await until(() => ready(503), 'dependency outage detection');
    log('Rehearsal: outage detected; checking liveness and request behavior.');
    assert.equal((await request('/v1/health')).status, 200);
    if (dependency === redis) assert.equal((await language()).status, 503);
    docker('unpause', dependency.id);
    const recoveryStarted = performance.now();
    await until(() => ready(200), 'dependency recovery');
    assert.equal((await language()).status, 200);
    recoveries.push({
      dependency: dependency === redis ? 'redis' : 'postgresql',
      recoveryMs: Math.round(performance.now() - recoveryStarted),
    });
  }
  const metrics = await request('/internal/metrics', {
    headers: { authorization: `Bearer ${metricsToken}` },
  });
  assert.equal(metrics.status, 200);
  assert.ok(metrics.body.includes('status_code="503"'));
  assert.ok(!metrics.body.includes(apiKey));
  log(
    JSON.stringify(
      {
        mode: 'isolated-local-rehearsal',
        node: process.version,
        concurrency: 4,
        requests: times.length,
        fixture: 'synthetic-200-code-points',
        durationMs: Math.round(durationMs),
        p95Ms: Math.round(times[Math.ceil(times.length * 0.95) - 1]),
        recoveries,
      },
      null,
      2,
    ),
  );
} finally {
  // Unpause before closing pools so shutdown cannot wait on frozen dependencies.
  for (const id of owned) {
    try {
      docker('unpause', id);
    } catch {
      /* Already running. */
    }
  }
  try {
    await app?.close();
  } finally {
    const failures = [];
    for (const id of owned) {
      try {
        docker('stop', id);
      } catch {
        failures.push(id);
      }
    }
    if (failures.length) {
      log(`Could not clean up rehearsal containers: ${failures.join(', ')}`);
      process.exitCode = 1;
    }
  }
}
