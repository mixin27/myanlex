import { PrismaUsageLedgerRepository } from '../apps/api/src/infrastructure/database/prisma-usage-ledger.repository.js';
import { UsageAlerts } from '../apps/api/src/infrastructure/database/usage-alerts.js';
import {
  retainedSince,
  usageRetention,
} from '../apps/api/src/modules/platform/usage-ledger.js';

function retentionMonths() {
  const raw = process.env.MYANLEX_USAGE_RETENTION_MONTHS;
  if (raw === undefined || raw === '') return usageRetention.defaultMonths;
  const months = Number(raw);
  if (!Number.isInteger(months) || months < usageRetention.minimumMonths)
    throw new Error(
      `MYANLEX_USAGE_RETENTION_MONTHS must be an integer of at least ${usageRetention.minimumMonths}.`,
    );
  return months;
}

// Removes per-request ledger rows past retention. Only months that already have
// a closed statement are touched; statements themselves are kept permanently.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const months = retentionMonths();
  const repository = new PrismaUsageLedgerRepository(url);
  try {
    const before = retainedSince(await repository.currentMonth(), months);
    let deleted = 0;
    for (let batch = 0; batch < 100; batch++) {
      const count = await repository.cleanup(before);
      deleted += count;
      if (count < 500) break;
    }
    const alerts = new UsageAlerts(url);
    const removedAlerts = await alerts
      .cleanup(before)
      .finally(() => alerts.close());
    console.log(
      `Removed ${deleted} usage ledger rows and ${removedAlerts.count} usage alerts from months before ${before.toISOString().slice(0, 7)} (retention ${months} months).`,
    );
  } finally {
    await repository.onApplicationShutdown();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      (error.message.startsWith('MYANLEX_') ||
        error.message.startsWith('Set DATABASE_URL'))
      ? error.message
      : 'Usage cleanup failed.',
  );
  process.exitCode = 1;
});
