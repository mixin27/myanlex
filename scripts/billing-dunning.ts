import { smtpSenderFromEnv } from '../apps/api/src/common/mail/smtp-transport.js';
import { InvoiceAdmin } from '../apps/api/src/infrastructure/database/billing-invoices.js';
import { deliverDunning } from '../apps/api/src/infrastructure/database/billing-mail.js';

// Daily: emails new invoices and reminders (days 0, 3 and 6 after issue) and
// moves workspaces with an overdue invoice to Free until it is paid.
// Idempotent. See docs/operations.md and ADR 0026.
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const admin = new InvoiceAdmin(url);
  try {
    const results = await deliverDunning(
      await admin.runDunning(),
      (id) => admin.contacts(id),
      smtpSenderFromEnv(),
      {
        portalUrl: process.env.AUTH_PUBLIC_URL,
        paymentInstructions: process.env.MYANLEX_BILLING_PAYMENT_INSTRUCTIONS,
      },
    );
    for (const result of results)
      console.log(`${result.number}: ${result.what}, email ${result.mail}.`);
    console.log(`Dunning: ${results.length} actions.`);
  } finally {
    await admin.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith('Set DATABASE_URL')
      ? error.message
      : 'Dunning failed.',
  );
  process.exitCode = 1;
});
