import { describe, expect, it } from 'vitest';

import {
  DAILY_STEPS,
  heartbeatUrl,
  runDaily,
  type Ping,
} from '../src/common/operations/daily-run.js';
import {
  backupKey,
  backupSettingsFromEnv,
  expiredBackupKeys,
  libpqEnvironment,
  listedKeys,
} from '../src/common/operations/backup.js';

function harness(
  codes: Record<string, number> = {},
  env: Record<string, string> = { BACKUP_S3_BUCKET: 'b' },
  pingFails = false,
) {
  const ran: string[] = [];
  const pings: { ping: Ping; body?: string }[] = [];
  const lines: Record<string, unknown>[] = [];
  let clock = 0;
  return {
    ran,
    pings,
    lines,
    go: () =>
      runDaily({
        env,
        run: async (step) => {
          ran.push(step.name);
          clock += 5;
          return codes[step.name] ?? 0;
        },
        ping: async (ping, body) => {
          pings.push({ ping, ...(body === undefined ? {} : { body }) });
          if (pingFails) throw new Error('network down');
        },
        log: (line) => lines.push(line),
        now: () => clock,
      }),
  };
}

describe('daily operations run', () => {
  it('runs backup, billing in order, then cleanups', async () => {
    const run = harness();
    const result = await run.go();
    expect(result.exitCode).toBe(0);
    expect(run.ran).toEqual(DAILY_STEPS.map((step) => step.name));
    expect(run.ran.slice(1, 4)).toEqual([
      'close-month',
      'issue-invoices',
      'dunning',
    ]);
    expect(run.pings.map((p) => p.ping)).toEqual(['start', 'success']);
    expect(result.results.every((r) => r.durationMs === 5)).toBe(true);
  });

  it('stops the billing chain at its first failure but still cleans up', async () => {
    const run = harness({ 'close-month': 2 });
    const result = await run.go();
    expect(run.ran).toEqual([
      'backup',
      'close-month',
      'usage-cleanup',
      'audit-cleanup',
      'playground-cleanup',
    ]);
    expect(result.exitCode).toBe(2);
    expect(
      result.results
        .filter((r) => r.outcome === 'skipped')
        .map((r) => [r.step, r.reason]),
    ).toEqual([
      ['issue-invoices', 'an earlier billing step failed'],
      ['dunning', 'an earlier billing step failed'],
    ]);
    expect(run.pings.at(-1)?.ping).toEqual({ exitCode: 2 });
    expect(run.pings.at(-1)?.body).toContain('close-month: failed (2)');
  });

  it('keeps billing going when the backup or a cleanup fails', async () => {
    const run = harness({ backup: 1, 'audit-cleanup': 3 });
    const result = await run.go();
    expect(run.ran).toEqual(DAILY_STEPS.map((step) => step.name));
    expect(result.exitCode).toBe(1);
    expect(
      result.results.filter((r) => r.outcome === 'failed').map((r) => r.step),
    ).toEqual(['backup', 'audit-cleanup']);
  });

  it('skips the backup when no bucket is configured', async () => {
    const run = harness({}, {});
    const result = await run.go();
    expect(run.ran).not.toContain('backup');
    expect(result.results[0]).toMatchObject({
      step: 'backup',
      outcome: 'skipped',
      reason: 'BACKUP_S3_BUCKET not set',
    });
    expect(result.exitCode).toBe(0);
  });

  it('treats a step that cannot start as failed and clamps odd exit codes', async () => {
    const run = harness({ dunning: 300 });
    expect((await run.go()).exitCode).toBe(1);
  });

  it('never fails the run because the heartbeat is down', async () => {
    const run = harness({}, { BACKUP_S3_BUCKET: 'b' }, true);
    const result = await run.go();
    expect(result.exitCode).toBe(0);
    expect(
      run.lines.filter((l) => l.event === 'heartbeat_failed'),
    ).toHaveLength(2);
  });

  it('logs only step names, outcomes, codes and durations', async () => {
    const run = harness(
      { dunning: 1 },
      {
        BACKUP_S3_BUCKET: 'b',
        DATABASE_URL: 'postgresql://u:secret@db/x',
      },
    );
    await run.go();
    const text = JSON.stringify(run.lines);
    expect(text).not.toContain('secret');
    for (const line of run.lines.filter((l) => l.event === 'ops_step'))
      expect(Object.keys(line).sort()).toEqual(
        expect.arrayContaining([
          'event',
          'step',
          'outcome',
          'exitCode',
          'durationMs',
        ]),
      );
  });
});

describe('heartbeat URLs', () => {
  const base = 'https://hc-ping.com/0f0e3c1a-uuid';
  it('follows the Healthchecks.io convention', () => {
    expect(heartbeatUrl(base, 'start')).toBe(`${base}/start`);
    expect(heartbeatUrl(`${base}/`, 'success')).toBe(base);
    expect(heartbeatUrl(base, { exitCode: 2 })).toBe(`${base}/2`);
  });
  it('requires https', () => {
    expect(() => heartbeatUrl('http://hc-ping.com/x', 'start')).toThrow(
      /https/,
    );
  });
});

describe('backups', () => {
  const at = new Date('2026-11-24T00:30:05.123Z');

  it('names dumps by UTC time', () => {
    expect(backupKey('postgres', at)).toBe(
      'postgres/myanlex-20261124T003005Z.dump',
    );
  });

  it('selects only this job’s dumps older than the retention window', () => {
    const keys = [
      'postgres/myanlex-20261109T003000Z.dump', // 15 days: expired
      'postgres/myanlex-20261110T003006Z.dump', // just inside 14 days
      'postgres/myanlex-20261124T003005Z.dump',
      'postgres/other-20260101T000000Z.dump',
      'postgres/myanlex-20260101T000000Z.dump.partial',
      'elsewhere/myanlex-20260101T000000Z.dump',
    ];
    expect(expiredBackupKeys(keys, 'postgres', at, 14)).toEqual([
      'postgres/myanlex-20261109T003000Z.dump',
    ]);
  });

  it('reads keys from a ListObjectsV2 response', () => {
    expect(
      listedKeys(
        '<ListBucketResult><Contents><Key>postgres/a&amp;b.dump</Key></Contents><Contents><Key>postgres/c.dump</Key></Contents></ListBucketResult>',
      ),
    ).toEqual(['postgres/a&b.dump', 'postgres/c.dump']);
  });

  it('validates settings without echoing secrets', () => {
    expect(() => backupSettingsFromEnv({ BACKUP_S3_BUCKET: 'b' })).toThrow(
      'Set BACKUP_S3_ENDPOINT, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY.',
    );
    const env = {
      BACKUP_S3_ENDPOINT: 'http://minio:9000',
      BACKUP_S3_BUCKET: 'b',
      BACKUP_S3_ACCESS_KEY_ID: 'id',
      BACKUP_S3_SECRET_ACCESS_KEY: 'super-secret',
    };
    expect(() => backupSettingsFromEnv(env)).toThrow(/https/);
    expect(
      backupSettingsFromEnv({ ...env, BACKUP_S3_ALLOW_HTTP: 'true' }),
    ).toMatchObject({ prefix: 'postgres', retentionDays: 14, region: 'auto' });
    expect(() =>
      backupSettingsFromEnv({
        ...env,
        BACKUP_S3_ENDPOINT: 'https://r2.example',
        BACKUP_RETENTION_DAYS: '0',
      }),
    ).toThrow(/RETENTION/);
  });

  it('passes credentials to pg_dump through libpq variables', () => {
    expect(
      libpqEnvironment(
        'postgresql://my%40user:p%2Fss@postgres:5433/myanlex?sslmode=require',
      ),
    ).toEqual({
      PGHOST: 'postgres',
      PGPORT: '5433',
      PGDATABASE: 'myanlex',
      PGUSER: 'my@user',
      PGPASSWORD: 'p/ss',
      PGSSLMODE: 'require',
    });
  });
});
