import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { smtpSenderFromEnv } from '../apps/api/src/common/mail/smtp-transport.js';
import { PlanAdminError } from '../apps/api/src/infrastructure/database/plan-admin.js';
import { readBillTo } from '../apps/api/src/modules/platform/billing-profile.js';
import {
  InvoiceAdmin,
  type InvoiceWithLines,
} from '../apps/api/src/infrastructure/database/billing-invoices.js';
import {
  deliverDunning,
  money,
  paymentReceived,
  sendToAll,
} from '../apps/api/src/infrastructure/database/billing-mail.js';

const usage = `Usage:
  pnpm billing:invoices issue-monthly [--month YYYY-MM]
  pnpm billing:invoices list [--status open|overdue|paid|void] [--workspace <slug>]
  pnpm billing:invoices show <number>
  pnpm billing:invoices mark-paid <number> --method bank_transfer|cash --reference <text> --actor <email> [--amount <minor units>]
  pnpm billing:invoices void <number> --reason <text> --actor <email>

Invoices are issued, reminded and suspended as described in docs/operations.md
(ADR 0026). Invoice email needs the SMTP_* variables.`;

const day = (date: Date) => date.toISOString().slice(0, 10);
const context = {
  portalUrl: process.env.AUTH_PUBLIC_URL,
  paymentInstructions: process.env.MYANLEX_BILLING_PAYMENT_INSTRUCTIONS,
};

function row(invoice: InvoiceWithLines) {
  return {
    number: invoice.number,
    workspace: invoice.organization.slug,
    kind: invoice.kind,
    period: `${day(invoice.periodStart)} – ${day(new Date(invoice.periodEnd.getTime() - 1))}`,
    total: money(invoice.totalMinor, invoice.currency.trim()),
    status:
      invoice.status === 'open' && invoice.dueAt < new Date()
        ? 'overdue'
        : invoice.status,
    due: day(invoice.dueAt),
    ...(invoice.restoresPlanSlug
      ? { suspended: invoice.restoresPlanSlug }
      : {}),
  };
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      month: { type: 'string' },
      status: { type: 'string' },
      workspace: { type: 'string' },
      method: { type: 'string' },
      reference: { type: 'string' },
      amount: { type: 'string' },
      actor: { type: 'string' },
      reason: { type: 'string' },
    },
  });
  const [command, number] = positionals;
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new PlanAdminError('Set DATABASE_URL for the intended database.');
  const admin = new InvoiceAdmin(url);
  const send = smtpSenderFromEnv();
  try {
    if (command === 'issue-monthly') {
      if (values.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(values.month))
        throw new PlanAdminError('--month must be YYYY-MM.');
      const run = await admin.issueMonthly(
        values.month ? new Date(`${values.month}-01T00:00:00Z`) : undefined,
      );
      if (run.issued.length) console.table(run.issued.map(row));
      console.log(`Issued ${run.issued.length} monthly invoices.`);
      if (run.waitingForStatement.length) {
        console.error(
          `Not yet invoiced (run pnpm usage:close-month first): ${run.waitingForStatement.join(', ')}.`,
        );
        process.exitCode = 2;
      }
      // Email the new invoices now; later reminders come from billing:dunning.
      const sent = await deliverDunning(
        await admin.runDunning(run.issued.map((invoice) => invoice.id)),
        (id) => admin.contacts(id),
        send,
        context,
      );
      for (const result of sent)
        console.log(`${result.number}: ${result.what}, email ${result.mail}.`);
    } else if (command === 'list') {
      const status = values.status as
        'open' | 'overdue' | 'paid' | 'void' | undefined;
      if (status && !['open', 'overdue', 'paid', 'void'].includes(status))
        throw new PlanAdminError(
          '--status must be open, overdue, paid or void.',
        );
      const invoices = await admin.list({
        status,
        workspace: values.workspace,
      });
      if (invoices.length) console.table(invoices.map(row));
      else console.log('No invoices.');
    } else if (command === 'show' && number) {
      const invoice = await admin.show(number);
      console.table([row(invoice)]);
      if (invoice.billTo !== null) {
        const billTo = readBillTo(invoice.billTo, invoice.organization.name);
        console.log(
          `Billed to: ${[billTo.name, billTo.address?.replace(/\s*\n\s*/g, ', '), billTo.taxId && `Tax ID ${billTo.taxId}`, billTo.note && `Reference ${billTo.note}`].filter(Boolean).join('; ')}`,
        );
      }
      console.table(
        invoice.lines.map((line) => ({
          line: line.description,
          amount: money(line.amountMinor, invoice.currency.trim()),
        })),
      );
      for (const payment of invoice.payments)
        console.log(
          `Paid ${money(payment.amountMinor, payment.currency.trim())} by ${payment.method} on ${day(payment.receivedAt)}, recorded by ${payment.recordedBy}${payment.note ? `: ${payment.note}` : ''}.`,
        );
    } else if (
      command === 'mark-paid' &&
      number &&
      values.actor &&
      values.reference &&
      (values.method === 'bank_transfer' || values.method === 'cash')
    ) {
      if (values.amount && !/^\d+$/.test(values.amount))
        throw new PlanAdminError(
          '--amount is an integer in the currency’s minor units.',
        );
      const { invoice, restored } = await admin.recordPayment({
        invoiceNumber: number,
        method: values.method,
        amountMinor: values.amount ? BigInt(values.amount) : undefined,
        note: values.reference,
        actorEmail: values.actor,
      });
      console.log(
        `${invoice.number} paid: ${money(invoice.totalMinor, invoice.currency.trim())}.${restored ? ` Restored the ${restored} plan for ${invoice.organization.slug}.` : ''}`,
      );
      const mail = await sendToAll(
        send,
        await admin.contacts(invoice.organizationId),
        paymentReceived(invoice, restored, context),
      );
      console.log(`Receipt email: ${mail}.`);
    } else if (command === 'void' && number && values.actor && values.reason) {
      const invoice = await admin.void({
        invoiceNumber: number,
        reason: values.reason,
        actorEmail: values.actor,
      });
      console.log(`${invoice.number} voided.`);
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
  else console.error('The invoice command failed.');
  process.exitCode = 1;
});
