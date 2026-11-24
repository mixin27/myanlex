import type {
  MailMessage,
  SendMail,
} from '../../common/mail/smtp-transport.js';

/** Invoice email (ADR 0026). Plain text; no secrets or usage content. */

export interface InvoiceForMail {
  readonly number: string;
  readonly organizationId: string;
  readonly organization: { readonly name: string };
  readonly currency: string;
  readonly totalMinor: bigint;
  readonly dueAt: Date;
  readonly lines: readonly {
    readonly description: string;
    readonly amountMinor: bigint;
  }[];
}

export interface MailContext {
  /** Portal origin for invoice links, e.g. AUTH_PUBLIC_URL; optional. */
  readonly portalUrl?: string | undefined;
  /** MYANLEX_BILLING_PAYMENT_INSTRUCTIONS; optional. */
  readonly paymentInstructions?: string | undefined;
}

/** Exact currency formatting from minor units (MMK 0 digits, USD 2). */
export function money(minor: bigint, currency: string) {
  const digits =
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const negative = minor < 0n;
  const text = (negative ? -minor : minor).toString().padStart(digits + 1, '0');
  const decimal = digits
    ? `${text.slice(0, -digits)}.${text.slice(-digits)}`
    : text;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(`${negative ? '-' : ''}${decimal}` as unknown as number)
    .replace(/\u00a0/g, ' ');
}

const day = (date: Date) => date.toISOString().slice(0, 10);

function link(invoice: InvoiceForMail, context: MailContext) {
  if (!context.portalUrl) return [];
  const url = new URL(`/billing/invoices/${invoice.number}`, context.portalUrl);
  url.searchParams.set('organization', invoice.organizationId);
  return ['', `View the invoice: ${url.toString()}`];
}

function howToPay(context: MailContext) {
  return context.paymentInstructions
    ? ['', 'How to pay:', context.paymentInstructions]
    : ['', 'Reply to this email if you need payment details.'];
}

function summary(invoice: InvoiceForMail) {
  return [
    ...invoice.lines.map(
      (line) =>
        `  ${line.description}: ${money(line.amountMinor, invoice.currency)}`,
    ),
    `  Total: ${money(invoice.totalMinor, invoice.currency)}`,
  ];
}

export function invoiceIssued(
  invoice: InvoiceForMail,
  context: MailContext,
): Omit<MailMessage, 'to'> {
  return {
    subject: `Invoice ${invoice.number} for ${invoice.organization.name}: ${money(invoice.totalMinor, invoice.currency)} due ${day(invoice.dueAt)}`,
    text: [
      `MyanLex has issued invoice ${invoice.number} for "${invoice.organization.name}".`,
      '',
      ...summary(invoice),
      '',
      `Please pay by ${day(invoice.dueAt)} (UTC). Include the invoice number with your payment.`,
      ...howToPay(context),
      ...link(invoice, context),
    ].join('\n'),
  };
}

export function invoiceReminder(
  invoice: InvoiceForMail,
  context: MailContext,
): Omit<MailMessage, 'to'> {
  return {
    subject: `Reminder: invoice ${invoice.number} is due ${day(invoice.dueAt)}`,
    text: [
      `Invoice ${invoice.number} for "${invoice.organization.name}" (${money(invoice.totalMinor, invoice.currency)}) is still unpaid and due on ${day(invoice.dueAt)} (UTC).`,
      'If it is not paid by then, the workspace moves to the Free plan until it is.',
      ...howToPay(context),
      ...link(invoice, context),
    ].join('\n'),
  };
}

export function workspaceSuspended(
  invoice: InvoiceForMail,
  plan: string,
  context: MailContext,
): Omit<MailMessage, 'to'> {
  return {
    subject: `${invoice.organization.name} moved to the Free plan: invoice ${invoice.number} is overdue`,
    text: [
      `Invoice ${invoice.number} (${money(invoice.totalMinor, invoice.currency)}) was due on ${day(invoice.dueAt)} and hasn't been paid, so "${invoice.organization.name}" has moved from the ${plan} plan to Free. Free plan limits now apply.`,
      'Paying the invoice restores the plan straight away.',
      ...howToPay(context),
      ...link(invoice, context),
    ].join('\n'),
  };
}

export function paymentReceived(
  invoice: InvoiceForMail,
  restored: string | null,
  context: MailContext,
): Omit<MailMessage, 'to'> {
  return {
    subject: `Payment received for invoice ${invoice.number}`,
    text: [
      `Thank you. We've received ${money(invoice.totalMinor, invoice.currency)} for invoice ${invoice.number} ("${invoice.organization.name}").`,
      ...(restored ? ['', `The ${restored} plan has been restored.`] : []),
      ...link(invoice, context),
    ].join('\n'),
  };
}

export type MailOutcome = 'sent' | 'failed' | 'skipped';

/** Sends to each recipient; best-effort, never throws. */
export async function sendToAll(
  send: SendMail | null,
  recipients: readonly string[],
  message: Omit<MailMessage, 'to'>,
): Promise<MailOutcome> {
  if (!send || recipients.length === 0) return 'skipped';
  let failed = false;
  for (const to of recipients)
    await send({ to, ...message }).catch(() => {
      failed = true;
    });
  return failed ? 'failed' : 'sent';
}

/** Emails what dunning did: the issue notice, reminders and suspensions. */
export async function deliverDunning(
  actions: readonly {
    readonly invoice: InvoiceForMail;
    readonly kind: 'reminder' | 'suspended';
    readonly reminder?: number;
    readonly suspendedPlan?: string;
  }[],
  contacts: (organizationId: string) => Promise<string[]>,
  send: SendMail | null,
  context: MailContext,
) {
  const results: { number: string; what: string; mail: MailOutcome }[] = [];
  for (const action of actions) {
    const message =
      action.kind === 'suspended'
        ? workspaceSuspended(
            action.invoice,
            action.suspendedPlan ?? 'paid',
            context,
          )
        : action.reminder === 1
          ? invoiceIssued(action.invoice, context)
          : invoiceReminder(action.invoice, context);
    results.push({
      number: action.invoice.number,
      what:
        action.kind === 'suspended'
          ? `moved to Free (was ${action.suspendedPlan})`
          : action.reminder === 1
            ? 'issued'
            : `reminder ${action.reminder! - 1}`,
      mail: await sendToAll(
        send,
        await contacts(action.invoice.organizationId),
        message,
      ),
    });
  }
  return results;
}
