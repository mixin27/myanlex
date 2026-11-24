import { Client } from 'pg';

/**
 * Runs `task` while holding a session-level Postgres advisory lock, or
 * returns `{ locked: false }` without running it when another session holds
 * it. The lock is released when the connection closes, even after a crash.
 */
export async function withAdvisoryLock<T>(
  databaseUrl: string,
  key: bigint,
  task: () => Promise<T>,
): Promise<{ locked: true; value: T } | { locked: false }> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
      [key.toString()],
    );
    if (!rows[0]?.acquired) return { locked: false };
    try {
      return { locked: true, value: await task() };
    } finally {
      await client
        .query('SELECT pg_advisory_unlock($1::bigint)', [key.toString()])
        .catch(() => undefined);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
}
