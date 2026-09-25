import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { log } from 'node:console';
import process from 'node:process';
import { URL } from 'node:url';

// Fixed local image tags; never accepts external service URLs or existing IDs.
const network = `myanlex-packaging-${randomUUID()}`;
const owned = [];
let networkCreated = false;
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
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
function start(image, alias, extra = []) {
  const id = docker(
    'run',
    '--rm',
    '-d',
    '--network',
    network,
    '--network-alias',
    alias,
    '--name',
    `${network}-${alias}`,
    ...extra,
    image,
  );
  assert.match(id, /^[a-f0-9]{64}$/);
  owned.push(id);
  return id;
}
async function until(check, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (interrupted) throw new Error('Interrupted');
    if (await check()) return;
    await setTimeout(500);
  }
  throw new Error(`Timed out: ${description}`);
}
const address = (id, port) => {
  const mapped = docker('port', id, `${port}/tcp`);
  assert.match(mapped, /^127\.0\.0\.1:\d+$/);
  return `http://${mapped}`;
};
const request = (url, options = {}) =>
  globalThis.fetch(url, {
    ...options,
    redirect: 'manual',
    signal: globalThis.AbortSignal.timeout(5000),
  });
async function ready(url) {
  await until(async () => {
    try {
      return (await request(url)).ok;
    } catch {
      return false;
    }
  }, url);
}

try {
  docker('network', 'create', network);
  networkCreated = true;
  const pg = start('postgres:18.6-alpine', 'postgres', [
    '-e',
    'POSTGRES_USER=myanlex',
    '-e',
    'POSTGRES_PASSWORD=test-only',
    '-e',
    'POSTGRES_DB=packaging',
  ]);
  start('redis:8.10.1-alpine', 'redis');
  await until(() => {
    try {
      docker('exec', pg, 'pg_isready', '-U', 'myanlex', '-d', 'packaging');
      return true;
    } catch {
      return false;
    }
  }, 'PostgreSQL');
  const databaseUrl = 'postgresql://myanlex:test-only@postgres:5432/packaging';
  const migrate = (...command) =>
    docker(
      'run',
      '--rm',
      '--network',
      network,
      '-e',
      `DATABASE_URL=${databaseUrl}`,
      'myanlex-migrate:packaging-test',
      ...command,
    );
  migrate('pnpm', 'db:deploy');
  migrate('pnpm', 'db:deploy'); // Migration replay must be safe.
  migrate('pnpm', 'db:seed');
  const sql = (db, query) =>
    docker(
      'exec',
      pg,
      'psql',
      '-U',
      'myanlex',
      '-d',
      db,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    );
  assert.ok(Number(sql('packaging', 'SELECT count(*) FROM permissions')) > 0);
  assert.equal(
    sql('packaging', "SELECT count(*) FROM plans WHERE slug='free'"),
    '1',
  );

  // Custom-format backup, restored only into a new database in our own container.
  const dump = execFileSync(
    'docker',
    [
      'exec',
      pg,
      'pg_dump',
      '-U',
      'myanlex',
      '-d',
      'packaging',
      '-Fc',
      '--no-owner',
      '--no-acl',
    ],
    { timeout: 30_000, maxBuffer: 32 * 1024 * 1024 },
  );
  docker('exec', pg, 'createdb', '-U', 'myanlex', 'packaging_restored');
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      pg,
      'pg_restore',
      '-U',
      'myanlex',
      '-d',
      'packaging_restored',
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
    ],
    { input: dump, timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  for (const table of ['permissions', 'plans', '_prisma_migrations']) {
    assert.equal(
      sql('packaging_restored', `SELECT count(*) FROM ${table}`),
      sql('packaging', `SELECT count(*) FROM ${table}`),
    );
  }
  const apiKey = randomUUID();
  const api = start('myanlex-api:packaging-test', 'api', [
    '--read-only',
    '--tmpfs',
    '/tmp',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '-p',
    '127.0.0.1::3001',
    '-e',
    `DATABASE_URL=${databaseUrl}`,
    '-e',
    'REDIS_URL=redis://redis:6379',
    '-e',
    'AUTH_ENABLED=true',
    '-e',
    `AUTH_SECRET=${randomUUID()}`,
    '-e',
    'AUTH_PUBLIC_URL=https://console.example',
    '-e',
    'SMTP_HOST=127.0.0.1',
    '-e',
    'SMTP_PORT=9',
    '-e',
    'SMTP_FROM=auth@example.org',
    '-e',
    `MYANLEX_API_KEY=${apiKey}`,
  ]);
  const apiUrl = address(api, 3001);
  await ready(`${apiUrl}/v1/health/ready`);
  const payload = {
    text: '',
    from: 'zawgyi',
    to: 'unicode',
    validateSource: true,
  };
  const converted = await request(`${apiUrl}/v1/text/convert`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  assert.equal(converted.status, 200);
  assert.equal((await converted.json()).output, '');
  assert.equal((await request(`${apiUrl}/internal/metrics`)).status, 404);
  const web = start('myanlex-web:packaging-test', 'web', [
    '-p',
    '127.0.0.1::3000',
    '-e',
    'API_INTERNAL_URL=http://api:3001',
  ]);
  const docs = start('myanlex-docs:packaging-test', 'docs', [
    '-p',
    '127.0.0.1::3002',
  ]);
  const webUrl = address(web, 3000);
  const docsUrl = address(docs, 3002);
  await ready(`${webUrl}/login`);
  assert.equal((await request(`${webUrl}/`)).status, 307);
  const dashboard = await request(`${webUrl}/dashboard`);
  assert.equal(dashboard.status, 307);
  assert.equal(
    new URL(dashboard.headers.get('location'), webUrl).pathname,
    '/login',
  );
  await ready(`${docsUrl}/docs/beta-limitations`);
  assert.equal((await request(`${webUrl}/openapi.json`)).status, 200);
  assert.equal(
    (await request(`${webUrl}/v1/platform/organizations`)).status,
    401,
  );
  assert.equal((await request(`${docsUrl}/openapi.json`)).status, 200);
  assert.ok(
    (
      await (
        await request(`${docsUrl}/api/search?query=syllabification`)
      ).json()
    ).length > 0,
  );
  for (const [url, path] of [
    [webUrl, '/login'],
    [docsUrl, '/docs/beta-limitations'],
  ]) {
    const html = await (await request(`${url}${path}`)).text();
    const asset = html.match(/(?:src|href)="(\/_next\/static\/[^"?]+)/)?.[1];
    assert.ok(asset, 'Expected a built static asset');
    assert.equal((await request(`${url}${asset}`)).status, 200);
  }
  for (const id of [api, web, docs])
    assert.notEqual(docker('exec', id, 'id', '-u'), '0');
  log(
    'Deployment smoke passed: non-root runtime images, readiness, conversion, portal proxy, docs/search/assets, migration replay, seed and isolated backup/restore.',
  );
} finally {
  for (const id of owned.reverse()) {
    try {
      docker('rm', '-f', '-v', id);
    } catch {
      process.exitCode = 1;
    }
  }
  if (networkCreated) {
    try {
      docker('network', 'rm', network);
    } catch {
      process.exitCode = 1;
    }
  }
}
