import { smtpSenderFromEnv } from '../apps/api/src/common/mail/smtp-transport.js';
import {
  heartbeatUrl,
  type Ping,
} from '../apps/api/src/common/operations/daily-run.js';
import {
  sendToAll,
  usageAlert,
} from '../apps/api/src/infrastructure/database/billing-mail.js';
import { UsageAlerts } from '../apps/api/src/infrastructure/database/usage-alerts.js';
import type {
  UsageAlertKind,
  UsageDimension,
} from '../apps/api/src/common/billing/usage-alerts.js';

// Every 15 minutes (infra/crontab): records usage thresholds crossed this
// month and emails each once to the workspace's billing contacts. Safe to run
// concurrently: the unique index allows each alert once. Unsent alerts are
// retried on later runs, up to three attempts. See docs/operations.md.

const log = (line: Record<string, unknown>) =>
  console.log(JSON.stringify({ time: new Date().toISOString(), ...line }));

async function ping(kind: Ping) {
  const base = process.env.MYANLEX_USAGE_ALERTS_HEARTBEAT_URL?.trim();
  if (!base) return;
  try {
    await fetch(heartbeatUrl(base, kind), {
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
    });
  } catch {
    log({ event: 'heartbeat_failed' });
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const base = process.env.MYANLEX_USAGE_ALERTS_HEARTBEAT_URL?.trim();
  if (base)
    try {
      heartbeatUrl(base, 'start'); // validate before doing any work
    } catch {
      throw new Error(
        'MYANLEX_USAGE_ALERTS_HEARTBEAT_URL must be an https:// URL.',
      );
    }
  const alerts = new UsageAlerts(url);
  const send = smtpSenderFromEnv();
  try {
    const created = await alerts.scan();
    let sent = 0;
    for (const pending of await alerts.pending()) {
      const { alert } = pending;
      const outcome = await sendToAll(
        send,
        await alerts.contacts(alert.organizationId),
        usageAlert(
          {
            organizationId: alert.organizationId,
            organizationName: pending.organizationName,
            kind: alert.kind as UsageAlertKind,
            dimension: alert.dimension as UsageDimension,
            used: alert.used,
            limit: alert.limitValue,
            plan: pending.plan,
            resetsAt: pending.resetsAt,
          },
          { portalUrl: process.env.AUTH_PUBLIC_URL },
        ),
      );
      if (outcome === 'sent') {
        await alerts.markSent(alert.id);
        sent += 1;
      } else await alerts.markFailed(alert.id);
      log({
        event: 'usage_alert',
        kind: alert.kind,
        dimension: alert.dimension,
        email: outcome,
      });
    }
    log({ event: 'usage_alerts', created, sent });
    await ping('success');
  } finally {
    await alerts.close();
  }
}

void main().catch(async (error: unknown) => {
  console.error(
    error instanceof Error && /^(Set DATABASE_URL|MYANLEX_)/.test(error.message)
      ? error.message
      : 'Usage alerts failed.',
  );
  await ping({ exitCode: 1 });
  process.exitCode = 1;
});
