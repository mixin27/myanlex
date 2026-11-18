import { PrismaAuditRepository } from '../apps/api/src/infrastructure/database/prisma-audit.repository.js';

const defaultRetentionDays = 365;
const minimumRetentionDays = 30;
const dayMs = 24 * 60 * 60 * 1000;

function retentionDays() {
  const raw = process.env.MYANLEX_AUDIT_RETENTION_DAYS;
  if (raw === undefined || raw === '') return defaultRetentionDays;
  const days = Number(raw);
  if (!Number.isInteger(days) || days < minimumRetentionDays)
    throw new Error(
      `MYANLEX_AUDIT_RETENTION_DAYS must be an integer of at least ${minimumRetentionDays}.`,
    );
  return days;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const days = retentionDays();
  const before = new Date(Date.now() - days * dayMs);
  const repository = new PrismaAuditRepository(url);
  let deleted = 0;
  try {
    // Bounded batches keep locks short; rerun from cron for large backlogs.
    for (let batch = 0; batch < 100; batch++) {
      const count = await repository.cleanup(before);
      deleted += count;
      if (count < 500) break;
    }
    console.log(
      `Removed ${deleted} audit events older than ${days} days (before ${before.toISOString()}).`,
    );
  } finally {
    await repository.onApplicationShutdown();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('MYANLEX_')
      ? error.message
      : 'Audit cleanup failed.',
  );
  process.exitCode = 1;
});
