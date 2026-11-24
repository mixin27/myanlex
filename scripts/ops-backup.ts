import {
  backupSettingsFromEnv,
  runBackup,
} from '../apps/api/src/common/operations/backup.js';

// pg_dump of DATABASE_URL to the BACKUP_S3_* bucket, then removes this job's
// dumps older than BACKUP_RETENTION_DAYS. Run by ops:daily; see
// docs/dokploy-runbook.md for the bucket and docs/deployment.md for restores.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const result = await runBackup(url, backupSettingsFromEnv(process.env));
  console.log(
    `Backed up ${(result.bytes / 1_048_576).toFixed(1)} MiB to ${result.key}; removed ${result.removed} old backups.`,
  );
}

void main().catch((error: unknown) => {
  // Messages are built without credentials; see backup.ts.
  console.error(
    `Backup failed: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
  process.exitCode = 1;
});
