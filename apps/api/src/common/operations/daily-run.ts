/**
 * The daily operations run (ADR 0027, docs/operations.md). One entry point
 * for cron: backup, then the billing chain in order, then retention cleanups,
 * with a heartbeat ping so both failures and missed runs alert.
 *
 * - The billing chain stops at its first failure: invoices must not be
 *   issued from an unclosed month, and dunning must not run on a half-issued
 *   one. Each step is idempotent, so the next run resumes it.
 * - A failed backup or cleanup does not stop billing, but fails the run.
 * - Logs are one JSON line per step: names, exit codes and durations only.
 */

export type StepGroup = 'backup' | 'billing' | 'cleanup';

export interface DailyStep {
  readonly name: string;
  readonly group: StepGroup;
  /** The package script to run, with its arguments. */
  readonly script: readonly string[];
  /** Skip the step unless this environment variable is set. */
  readonly requires?: string;
}

export const DAILY_STEPS: readonly DailyStep[] = [
  {
    name: 'backup',
    group: 'backup',
    script: ['ops:backup'],
    requires: 'BACKUP_S3_BUCKET',
  },
  { name: 'close-month', group: 'billing', script: ['usage:close-month'] },
  {
    name: 'issue-invoices',
    group: 'billing',
    script: ['billing:invoices', 'issue-monthly'],
  },
  { name: 'dunning', group: 'billing', script: ['billing:dunning'] },
  { name: 'usage-cleanup', group: 'cleanup', script: ['usage:cleanup'] },
  { name: 'audit-cleanup', group: 'cleanup', script: ['audit:cleanup'] },
  {
    name: 'playground-cleanup',
    group: 'cleanup',
    script: ['playground:cleanup'],
  },
];

export type StepOutcome = 'ok' | 'failed' | 'skipped';

export interface StepResult {
  readonly step: string;
  readonly outcome: StepOutcome;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly reason?: string;
}

export type Ping = 'start' | 'success' | { readonly exitCode: number };

export interface DailyRunDependencies {
  readonly steps?: readonly DailyStep[];
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Runs a step and resolves with its exit code. */
  readonly run: (step: DailyStep) => Promise<number>;
  /** Best-effort heartbeat; errors are swallowed by runDaily. */
  readonly ping: (ping: Ping, body?: string) => Promise<void>;
  readonly log: (line: Record<string, unknown>) => void;
  readonly now?: () => number;
}

export interface DailyRunResult {
  readonly exitCode: number;
  readonly results: readonly StepResult[];
}

export async function runDaily(
  dependencies: DailyRunDependencies,
): Promise<DailyRunResult> {
  const steps = dependencies.steps ?? DAILY_STEPS;
  const now = dependencies.now ?? Date.now;
  const ping = async (kind: Ping, body?: string) => {
    try {
      await dependencies.ping(kind, body);
    } catch {
      dependencies.log({ event: 'heartbeat_failed' });
    }
  };

  await ping('start');
  const results: StepResult[] = [];
  let billingStopped = false;
  for (const step of steps) {
    let result: StepResult;
    if (step.requires && !dependencies.env[step.requires]?.trim())
      result = {
        step: step.name,
        outcome: 'skipped',
        exitCode: null,
        durationMs: 0,
        reason: `${step.requires} not set`,
      };
    else if (step.group === 'billing' && billingStopped)
      result = {
        step: step.name,
        outcome: 'skipped',
        exitCode: null,
        durationMs: 0,
        reason: 'an earlier billing step failed',
      };
    else {
      const started = now();
      let exitCode: number;
      try {
        exitCode = await dependencies.run(step);
      } catch {
        exitCode = 1;
      }
      result = {
        step: step.name,
        outcome: exitCode === 0 ? 'ok' : 'failed',
        exitCode,
        durationMs: Math.max(0, now() - started),
      };
      if (exitCode !== 0 && step.group === 'billing') billingStopped = true;
    }
    results.push(result);
    dependencies.log({ event: 'ops_step', ...result });
  }

  const failed = results.filter((result) => result.outcome === 'failed');
  const exitCode = failed.length === 0 ? 0 : clampExit(failed[0]!.exitCode);
  const summary = results
    .map(
      (result) =>
        `${result.step}: ${result.outcome}${result.exitCode ? ` (${result.exitCode})` : ''}`,
    )
    .join('\n');
  await ping(exitCode === 0 ? 'success' : { exitCode }, summary);
  dependencies.log({
    event: 'ops_daily',
    exitCode,
    failed: failed.map((result) => result.step),
  });
  return { exitCode, results };
}

const clampExit = (code: number | null) =>
  code !== null && code >= 1 && code <= 255 ? code : 1;

/**
 * Healthchecks.io-style ping URLs: `<base>/start`, `<base>` on success and
 * `<base>/<exit code>` on failure. Only https is accepted, so the ping URL
 * (a capability) is never sent in clear.
 */
export function heartbeatUrl(base: string, ping: Ping): string {
  const url = new URL(base);
  if (url.protocol !== 'https:')
    throw new Error('MYANLEX_HEARTBEAT_URL must be an https:// URL.');
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname =
    ping === 'start'
      ? `${path}/start`
      : ping === 'success'
        ? path || '/'
        : `${path}/${ping.exitCode}`;
  return url.toString();
}

/** Exit status when another run holds the lock (EX_TEMPFAIL). */
export const LOCKED_EXIT_CODE = 75;
/** pg_advisory_lock key for the daily run: "MLXOPS01" as an int64. */
export const DAILY_LOCK_KEY = 0x4d4c584f50533031n;
