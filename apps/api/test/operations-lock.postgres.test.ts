import { describe, expect, it } from 'vitest';

import { withAdvisoryLock } from '../src/common/operations/advisory-lock.js';
import { DAILY_LOCK_KEY } from '../src/common/operations/daily-run.js';

const databaseURL = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseURL)('daily run lock on PostgreSQL', () => {
  it('lets only one run hold the lock and releases it afterwards', async () => {
    const url = databaseURL!;
    let inner: Awaited<ReturnType<typeof withAdvisoryLock<string>>> | undefined;
    const outer = await withAdvisoryLock(url, DAILY_LOCK_KEY, async () => {
      inner = await withAdvisoryLock(url, DAILY_LOCK_KEY, async () => 'ran');
      return 'outer';
    });
    expect(outer).toEqual({ locked: true, value: 'outer' });
    expect(inner).toEqual({ locked: false });
    expect(
      await withAdvisoryLock(url, DAILY_LOCK_KEY, async () => 'again'),
    ).toEqual({ locked: true, value: 'again' });
  });

  it('releases the lock when the task throws', async () => {
    const url = databaseURL!;
    await expect(
      withAdvisoryLock(url, DAILY_LOCK_KEY, async () => {
        throw new Error('step crashed');
      }),
    ).rejects.toThrow('step crashed');
    expect(await withAdvisoryLock(url, DAILY_LOCK_KEY, async () => 1)).toEqual({
      locked: true,
      value: 1,
    });
  });
});
