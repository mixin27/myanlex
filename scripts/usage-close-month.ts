import { PrismaUsageLedgerRepository } from '../apps/api/src/infrastructure/database/prisma-usage-ledger.repository.js';

// Closes every finished month that has no statement yet. Idempotent: run it
// daily from cron. Exits non-zero when a newly closed month does not reconcile.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const repository = new PrismaUsageLedgerRepository(url);
  try {
    let closed = 0;
    const unreconciled: string[] = [];
    // Each call closes at most one batch; loop until nothing is pending.
    for (let batch = 0; batch < 100; batch++) {
      const months = await repository.closeFinishedMonths();
      closed += months.length;
      for (const month of months)
        if (!month.reconciled)
          unreconciled.push(
            `${month.organizationId} ${month.monthStart.toISOString().slice(0, 7)}`,
          );
      if (months.length < 500) break;
    }
    console.log(`Closed ${closed} monthly usage statements.`);
    if (unreconciled.length) {
      console.error(
        `Ledger totals differ from quota counters for: ${unreconciled.join(', ')}. See docs/operations.md.`,
      );
      process.exitCode = 2;
    }
  } finally {
    await repository.onApplicationShutdown();
  }
}
void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('Set DATABASE_URL')
      ? error.message
      : 'Closing usage statements failed.',
  );
  process.exitCode = 1;
});
