import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import { AwsClient } from 'aws4fetch';

/**
 * Nightly logical backup to an S3-compatible bucket (Cloudflare R2 in the
 * Dokploy runbook). With Postgres on the same server, this is the copy that
 * survives losing the server: keep the bucket private, give its token access
 * to that bucket only, and run the restore drill in docs/deployment.md.
 */

export interface BackupSettings {
  readonly endpoint: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region: string;
  readonly prefix: string;
  readonly retentionDays: number;
}

export function backupSettingsFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): BackupSettings {
  const missing = [
    'BACKUP_S3_ENDPOINT',
    'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY',
  ].filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Set ${missing.join(', ')}.`);
  const endpoint = new URL(env.BACKUP_S3_ENDPOINT!);
  if (
    endpoint.protocol !== 'https:' &&
    env.BACKUP_S3_ALLOW_HTTP !== 'true' // local MinIO rehearsals only
  )
    throw new Error('BACKUP_S3_ENDPOINT must be an https:// URL.');
  const retentionDays = Number(env.BACKUP_RETENTION_DAYS ?? '14');
  if (!Number.isInteger(retentionDays) || retentionDays < 1)
    throw new Error('BACKUP_RETENTION_DAYS must be a positive integer.');
  const prefix = (env.BACKUP_S3_PREFIX ?? 'postgres').replace(/^\/+|\/+$/g, '');
  if (!/^[a-zA-Z0-9._/-]{1,200}$/.test(prefix))
    throw new Error(
      'BACKUP_S3_PREFIX may only contain letters, digits and ._/-',
    );
  return {
    endpoint: endpoint.toString().replace(/\/+$/, ''),
    bucket: env.BACKUP_S3_BUCKET!.trim(),
    accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY!.trim(),
    region: env.BACKUP_S3_REGION?.trim() || 'auto',
    prefix,
    retentionDays,
  };
}

const stamp = (date: Date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

/** `<prefix>/myanlex-20261124T003000Z.dump`: sortable, one per run. */
export const backupKey = (prefix: string, at: Date) =>
  `${prefix}/myanlex-${stamp(at)}.dump`;

/** Keys of this job's dumps older than the retention window. */
export function expiredBackupKeys(
  keys: readonly string[],
  prefix: string,
  now: Date,
  retentionDays: number,
): string[] {
  const cutoff = stamp(new Date(now.getTime() - retentionDays * 86_400_000));
  const pattern = new RegExp(
    `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/myanlex-(\\d{8}T\\d{6}Z)\\.dump$`,
  );
  return keys.filter((key) => {
    const match = pattern.exec(key);
    return match !== null && match[1]! < cutoff;
  });
}

/** Object keys from a ListObjectsV2 response body. */
export const listedKeys = (xml: string) =>
  [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) =>
    match[1]!
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>'),
  );

/** libpq environment for a postgres:// URL, so no secret is put in argv. */
export function libpqEnvironment(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:')
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  const env: Record<string, string> = {
    PGHOST: decodeURIComponent(url.hostname),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
  if (url.username) env.PGUSER = decodeURIComponent(url.username);
  if (url.password) env.PGPASSWORD = decodeURIComponent(url.password);
  const sslmode = url.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

function pgDump(databaseUrl: string, file: string) {
  return new Promise<void>((resolve, reject) => {
    // Credentials go through the environment, not argv, so they never show
    // in process listings.
    const child = spawn(
      'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', `--file=${file}`],
      {
        env: { PATH: process.env.PATH, ...libpqEnvironment(databaseUrl) },
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => {
      errors = (errors + chunk.toString()).slice(-2000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `pg_dump exited with ${code}: ${errors.replace(/postgres(ql)?:\/\/\S+/g, '<database>').trim()}`,
            ),
          ),
    );
  });
}

export async function runBackup(
  databaseUrl: string,
  settings: BackupSettings,
  now = new Date(),
): Promise<{ key: string; bytes: number; removed: number }> {
  const client = new AwsClient({
    accessKeyId: settings.accessKeyId,
    secretAccessKey: settings.secretAccessKey,
    service: 's3',
    region: settings.region,
  });
  const bucketUrl = `${settings.endpoint}/${encodeURIComponent(settings.bucket)}`;
  const directory = await mkdtemp(join(tmpdir(), 'myanlex-backup-'));
  const file = join(directory, 'backup.dump');
  try {
    await pgDump(databaseUrl, file);
    const { size } = await stat(file);
    const key = backupKey(settings.prefix, now);
    const upload = await client.fetch(`${bucketUrl}/${key}`, {
      method: 'PUT',
      body: Readable.toWeb(createReadStream(file)) as ReadableStream,
      headers: {
        'content-length': String(size),
        'content-type': 'application/octet-stream',
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      duplex: 'half',
    } as RequestInit);
    if (!upload.ok)
      throw new Error(`Upload failed with HTTP ${upload.status}.`);

    const list = await client.fetch(
      `${bucketUrl}?list-type=2&prefix=${encodeURIComponent(`${settings.prefix}/`)}&max-keys=1000`,
    );
    if (!list.ok) throw new Error(`Listing failed with HTTP ${list.status}.`);
    const expired = expiredBackupKeys(
      listedKeys(await list.text()),
      settings.prefix,
      now,
      settings.retentionDays,
    );
    for (const old of expired) {
      const removed = await client.fetch(`${bucketUrl}/${old}`, {
        method: 'DELETE',
      });
      if (!removed.ok && removed.status !== 404)
        throw new Error(
          `Removing an old backup failed with HTTP ${removed.status}.`,
        );
    }
    return { key, bytes: size, removed: expired.length };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
