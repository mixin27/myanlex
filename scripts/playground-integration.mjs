import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { log } from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';

// Only disposable containers created by this invocation are ever removed.
const containers = [];
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 300_000,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${executable} failed: ${result.error?.message ?? result.stderr ?? result.status}`,
    );
  return result.stdout?.trim() ?? '';
}
function service(image, port, environment = []) {
  const id = command('docker', [
    'run',
    '--detach',
    '--name',
    'myanlex-playground-test-' + randomUUID(),
    '--publish',
    '127.0.0.1::' + port,
    ...environment.flatMap((value) => ['--env', value]),
    image,
  ]);
  if (!/^[a-f0-9]{64}$/.test(id))
    throw new Error('Unexpected container identifier.');
  containers.push(id);
  const mapping = command('docker', ['port', id, String(port) + '/tcp']);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(mapping);
  if (!match) throw new Error('Unexpected isolated service binding.');
  return { id, port: match[1] };
}
try {
  const password = randomUUID();
  const database = service('postgres:17-alpine', 5432, [
    'POSTGRES_PASSWORD=' + password,
    'POSTGRES_DB=playground',
  ]);
  const redis = service('redis:7-alpine', 6379);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = spawnSync(
      'docker',
      ['exec', database.id, 'pg_isready', '-U', 'postgres'],
      { timeout: 5000 },
    );
    if (result.status === 0) {
      ready = true;
      break;
    }
    await setTimeout(500);
  }
  if (!ready) throw new Error('Isolated PostgreSQL did not become ready.');
  // Exercise an existing database separately from Prisma's fresh-install path.
  command('docker', [
    'exec',
    database.id,
    'createdb',
    '-U',
    'postgres',
    'upgrade',
  ]);
  const sql = (input) =>
    command(
      'docker',
      [
        'exec',
        '-i',
        database.id,
        'psql',
        '-U',
        'postgres',
        '-d',
        'upgrade',
        '-v',
        'ON_ERROR_STOP=1',
        '-At',
      ],
      { input },
    );
  for (const migration of [
    '20260918190000_developer_platform',
    '20260919010000_account_authentication',
    '20260920000000_organization_quotas',
  ])
    sql(
      readFileSync('prisma/migrations/' + migration + '/migration.sql', 'utf8'),
    );
  const orgId = randomUUID();
  const projectId = randomUUID();
  const keyId = randomUUID();
  sql(`INSERT INTO organizations(id,name,slug,updated_at) VALUES ('${orgId}','Upgrade','upgrade',now());
    INSERT INTO projects(id,organization_id,name,slug,updated_at) VALUES ('${projectId}','${orgId}','Upgrade','upgrade',now());
    INSERT INTO api_keys(id,project_id,name,prefix,key_hash) VALUES ('${keyId}','${projectId}','Fixture','fixture',repeat('0',64));
    INSERT INTO api_usage(project_id,api_key_id,endpoint,status_code,characters_processed,processing_time_ms) VALUES ('${projectId}','${keyId}','text/normalize',200,7,1);`);
  sql(
    readFileSync(
      'prisma/migrations/20260927000000_playground/migration.sql',
      'utf8',
    ),
  );
  const existing = sql(
    `SELECT count(*) FROM api_usage WHERE source='api_key' AND api_key_id='${keyId}' AND characters_processed=7;`,
  );
  if (existing !== '1')
    throw new Error('Existing usage backfill changed attribution or values.');
  log('Existing-database migration and usage backfill passed.');
  const url = `postgresql://postgres:${password}@127.0.0.1:${database.port}/playground`;
  const env = {
    ...process.env,
    DATABASE_URL: url,
    MYANLEX_TEST_DATABASE_URL: url,
    MYANLEX_TEST_REDIS_URL: 'redis://127.0.0.1:' + redis.port,
  };
  for (const script of ['db:deploy', 'db:seed', 'check'])
    command('pnpm', [script], { env, stdio: 'inherit' });
  log('Playground verification passed against isolated PostgreSQL and Redis.');
} finally {
  for (const id of containers.reverse())
    command('docker', ['rm', '--force', id]);
}
