import { spawn } from 'node:child_process';

import { withAdvisoryLock } from '../apps/api/src/common/operations/advisory-lock.js';
import {
  DAILY_LOCK_KEY,
  LOCKED_EXIT_CODE,
  heartbeatUrl,
  runDaily,
  type DailyStep,
  type Ping,
} from '../apps/api/src/common/operations/daily-run.js';

// Daily operations run for cron (infra/crontab): backup, close-month,
// issue-monthly, dunning, then retention cleanups. See docs/operations.md.
// Exit codes: 0 ok; the first failed step's code; 75 when another run holds
// the lock; 1 when it cannot start.

const log = (line: Record<string, unknown>) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), ...line }));

function run(step: DailyStep) {
  return new Promise<number>((resolve) => {
    const child = spawn('pnpm', ['--silent', ...step.script], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function ping(kind: Ping, body?: string) {
  const base = process.env.MYANLEX_HEARTBEAT_URL?.trim();
  if (!base) return;
  const response = await fetch(heartbeatUrl(base, kind), {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined ? {} : { body }),
    signal: AbortSignal.timeout(5_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Heartbeat returned ${response.status}.`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const base = process.env.MYANLEX_HEARTBEAT_URL?.trim();
  if (base) heartbeatUrl(base, 'start'); // validate before doing any work
  const outcome = await withAdvisoryLock(url, DAILY_LOCK_KEY, () =>
    runDaily({ env: process.env, run, ping, log }),
  );
  if (!outcome.locked) {
    log({ event: 'ops_daily', skipped: 'another run holds the lock' });
    process.exitCode = LOCKED_EXIT_CODE;
    return;
  }
  process.exitCode = outcome.value.exitCode;
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error &&
      /^(Set DATABASE_URL|MYANLEX_HEARTBEAT_URL)/.test(error.message)
      ? error.message
      : 'The daily run could not start.',
  );
  process.exitCode = 1;
});
