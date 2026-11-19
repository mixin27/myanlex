import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import {
  PlanAdmin,
  PlanAdminError,
} from '../apps/api/src/infrastructure/database/plan-admin.js';

const usage = `Usage:
  pnpm billing:assign <workspace-slug> <plan-slug> --actor <email> [--note <text>] [--starts-at <ISO time>]

Use the plan slug "free" to end the paid subscription. The change is recorded
in the workspace audit log as billing.plan_changed.`;

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      actor: { type: 'string' },
      note: { type: 'string' },
      'starts-at': { type: 'string' },
    },
  });
  const [organizationSlug, planSlug] = positionals;
  if (!organizationSlug || !planSlug || !values.actor) {
    console.error(usage);
    process.exitCode = 64;
    return;
  }
  const startsAt = values['starts-at']
    ? new Date(values['starts-at'])
    : undefined;
  if (startsAt && Number.isNaN(startsAt.getTime()))
    throw new PlanAdminError('--starts-at must be an ISO 8601 time.');
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new PlanAdminError('Set DATABASE_URL for the intended database.');
  const admin = new PlanAdmin(url);
  try {
    const result = await admin.assign({
      organizationSlug,
      planSlug,
      actorEmail: values.actor,
      note: values.note,
      startsAt,
    });
    console.log(
      `${organizationSlug}: ${result.from} → ${result.to} from ${result.startsAt.toISOString()}.`,
    );
  } finally {
    await admin.close();
  }
}

void main().catch((error: unknown) => {
  if (error instanceof PlanAdminError) console.error(error.message);
  else if (error instanceof ZodError)
    console.error('--actor must be an email address.');
  else console.error('The plan assignment failed.');
  process.exitCode = 1;
});
