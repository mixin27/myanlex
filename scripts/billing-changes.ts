import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { smtpSenderFromEnv } from '../apps/api/src/common/mail/smtp-transport.js';
import {
  PlanAdmin,
  PlanAdminError,
} from '../apps/api/src/infrastructure/database/plan-admin.js';
import {
  decisionEmail,
  sendDecision,
} from '../apps/api/src/infrastructure/database/plan-change-mail.js';

const usage = `Usage:
  pnpm billing:changes list [--all]
  pnpm billing:changes approve <change-id> --actor <email> [--note <text>]
  pnpm billing:changes reject <change-id> --actor <email> --reason <text>

Approval applies the plan the same way as billing:assign. The requester is
emailed the decision when SMTP_* variables are set. See docs/operations.md.`;

const day = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : 'on approval';

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      all: { type: 'boolean' },
      actor: { type: 'string' },
      note: { type: 'string' },
      reason: { type: 'string' },
    },
  });
  const [command, changeId] = positionals;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new PlanAdminError('Set DATABASE_URL for the intended database.');
  const admin = new PlanAdmin(url);
  const send = smtpSenderFromEnv();
  try {
    if (command === 'list') {
      const changes = await admin.listChanges(values.all ?? false);
      if (!changes.length) {
        console.log(values.all ? 'No plan changes.' : 'No open plan changes.');
        return;
      }
      console.table(
        changes.map((change) => ({
          id: change.id,
          workspace: change.organization.slug,
          from: change.fromPlanSlug,
          to: change.plan.slug,
          channel: change.channel,
          starts: day(change.requestedStartsAt),
          status: change.status,
          requester: change.requesterEmail,
          requested: change.createdAt
            .toISOString()
            .slice(0, 16)
            .replace('T', ' '),
        })),
      );
    } else if (command === 'approve' && changeId && values.actor) {
      const result = await admin.approveChange({
        changeId,
        actorEmail: values.actor,
        note: values.note,
      });
      const { startedEarly } = result;
      console.log(
        `${result.change.organization.slug}: ${result.change.fromPlanSlug} → ${result.change.plan.slug} from ${result.startsAt.toISOString()}${
          startedEarly
            ? ' (the requested date had passed, so it starts now)'
            : ''
        }.`,
      );
      const mail = await sendDecision(
        send,
        decisionEmail(
          { kind: 'applied', startsAt: result.startsAt, startedEarly },
          result.change,
        ),
      );
      console.log(`Requester email: ${mail}.`);
    } else if (
      command === 'reject' &&
      changeId &&
      values.actor &&
      values.reason
    ) {
      const change = await admin.rejectChange({
        changeId,
        actorEmail: values.actor,
        reason: values.reason,
      });
      console.log(
        `Rejected ${change.organization.slug}: ${change.fromPlanSlug} → ${change.plan.slug}.`,
      );
      const mail = await sendDecision(
        send,
        decisionEmail({ kind: 'rejected', reason: values.reason }, change),
      );
      console.log(`Requester email: ${mail}.`);
    } else {
      console.error(usage);
      process.exitCode = 64;
    }
  } finally {
    await admin.close();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof PlanAdminError) console.error(error.message);
  else if (error instanceof ZodError)
    console.error('--actor must be an email address.');
  else console.error('The plan change command failed.');
  process.exitCode = 1;
});
