import { readFile } from 'node:fs/promises';
import { ZodError } from 'zod';
import {
  PlanAdmin,
  PlanAdminError,
} from '../apps/api/src/infrastructure/database/plan-admin.js';

const usage = `Usage:
  pnpm billing:plans list
  pnpm billing:plans upsert <plan.json>
  pnpm billing:plans archive <slug>

See docs/operations.md#plans-and-pricing for the plan file format.`;

async function main() {
  const [command, argument] = process.argv.slice(2);
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new PlanAdminError('Set DATABASE_URL for the intended database.');
  const admin = new PlanAdmin(url);
  try {
    if (command === 'list') {
      const rows = (await admin.list()).map((plan) => ({
        slug: plan.slug,
        name: plan.name,
        currency: plan.currency,
        fee: plan.baseFeeMinor.toString(),
        requests: plan.monthlyRequestLimit?.toString() ?? 'unlimited',
        characters: plan.monthlyCharacterLimit?.toString() ?? 'unlimited',
        overage: plan.overageMode,
        public: plan.public,
        subscriptions: plan.subscriptions,
        archived: plan.archivedAt
          ? plan.archivedAt.toISOString().slice(0, 10)
          : '',
      }));
      console.table(rows);
    } else if (command === 'upsert' && argument) {
      const definition: unknown = JSON.parse(await readFile(argument, 'utf8'));
      console.log(`Plan ${await admin.upsert(definition)}.`);
    } else if (command === 'archive' && argument) {
      await admin.archive(argument);
      console.log(`Archived ${argument}; existing subscriptions keep it.`);
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
    console.error(
      error.issues
        .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`)
        .join('\n'),
    );
  else if (error instanceof SyntaxError)
    console.error('The plan file is not valid JSON.');
  else console.error('The plan command failed.');
  process.exitCode = 1;
});
