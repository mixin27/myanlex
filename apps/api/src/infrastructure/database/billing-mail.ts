import type {
  MailMessage,
  SendMail,
} from '../../common/mail/smtp-transport.js';
import { readBillTo } from '../../modules/platform/billing-profile.js';
import type { PlanTerms } from '../../common/billing/pricing.js';
import type {
  UsageAlertKind,
  UsageDimension,
} from '../../common/billing/usage-alerts.js';

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
  /** Bill-to snapshot (JSON); null on invoices issued before it existed. */
  readonly billTo?: unknown;
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

/** Asks the holder of a new billing address to confirm it (link, then a button). */
export function billingEmailConfirmation(
  organizationName: string,
  token: string,
  portalUrl: string,
): Omit<MailMessage, 'to'> {
  const url = new URL('/billing-email/confirm', portalUrl);
  url.searchParams.set('token', token);
  return {
    subject: `Confirm billing email for ${organizationName} on MyanLex`,
    text: [
      `"${organizationName}" on MyanLex wants to send its invoices and payment receipts to this address.`,
      '',
      `Confirm it: ${url.toString()}`,
      '',
      'The link works for 7 days. If you did not expect this, ignore this email and nothing will be sent here.',
    ].join('\n'),
  };
}

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

/** "Billed to" lines from the invoice's snapshot; empty fields are left out. */
function billedTo(invoice: InvoiceForMail) {
  if (invoice.billTo === null || invoice.billTo === undefined) return [];
  const billTo = readBillTo(invoice.billTo, invoice.organization.name);
  return [
    'Billed to:',
    ...[billTo.name, ...(billTo.address?.split(/\r?\n/) ?? [])]
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `  ${line}`),
    ...(billTo.taxId ? [`  Tax ID: ${billTo.taxId}`] : []),
    ...(billTo.note ? [`  Reference: ${billTo.note}`] : []),
    '',
  ];
}

/** The customer's PO or reference line, when the invoice has one. */
function reference(invoice: InvoiceForMail) {
  const note = readBillTo(invoice.billTo, '').note;
  return note ? [`Reference: ${note}`] : [];
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
      ...billedTo(invoice),
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
      ...reference(invoice),
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

const count = (value: bigint) => value.toLocaleString('en-US');
const longDay = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** A usage threshold crossed this month (docs/platform.md#usage-alerts). */
export function usageAlert(
  input: {
    readonly organizationId: string;
    readonly organizationName: string;
    readonly kind: UsageAlertKind;
    readonly dimension: UsageDimension;
    readonly used: bigint;
    readonly limit: bigint;
    readonly plan: Pick<
      PlanTerms,
      | 'name'
      | 'overageMode'
      | 'currency'
      | 'monthlyRequestLimit'
      | 'monthlyCharacterLimit'
      | 'requestBlock'
      | 'requestBlockPriceMinor'
      | 'characterBlock'
      | 'characterBlockPriceMinor'
      | 'requestCeiling'
      | 'characterCeiling'
    >;
    /** When the monthly counters reset (the 1st, UTC). */
    readonly resetsAt: Date;
  },
  context: MailContext,
): Omit<MailMessage, 'to'> {
  const { organizationName: name, dimension, plan } = input;
  const usage = `${count(input.used)} of ${count(input.limit)} ${dimension}`;
  const resets = `${longDay(input.resetsAt)} (UTC)`;
  const requests = dimension === 'requests';
  const block = requests ? plan.requestBlock : plan.characterBlock;
  const price = requests
    ? plan.requestBlockPriceMinor
    : plan.characterBlockPriceMinor;
  const ceiling = requests ? plan.requestCeiling : plan.characterCeiling;
  const refused = `Requests are refused${requests ? '' : ' when they would go over'}`;
  let subject: string;
  let body: string[];
  switch (input.kind) {
    case 'allowance_80':
      subject = `${name} has used 80% of its monthly ${dimension}`;
      body = [
        `"${name}" has used ${usage} included in the ${plan.name} plan this month.`,
        plan.overageMode === 'allow'
          ? `Usage above the allowance is billed as overage: ${money(price, plan.currency)} per ${count(block)} ${dimension}.`
          : `When the allowance is used up, API requests are refused until it resets on ${resets}.`,
      ];
      break;
    case 'allowance_100':
      if (plan.overageMode === 'allow') {
        subject = `${name} is now using overage`;
        body = [
          `"${name}" has used all ${count(input.limit)} ${dimension} included in the ${plan.name} plan this month.`,
          `Further usage is billed as overage: ${money(price, plan.currency)} per ${count(block)} ${dimension}, on next month's invoice.`,
          ...(ceiling !== null
            ? [
                `${refused} at the plan's ceiling of ${count(ceiling)} ${dimension}.`,
              ]
            : []),
        ];
      } else {
        subject = `${name} has reached its monthly ${dimension.slice(0, -1)} allowance`;
        body = [
          `"${name}" has used all ${count(input.limit)} ${dimension} included in the ${plan.name} plan this month.`,
          `API requests are now refused until the allowance resets on ${resets}, or until the workspace moves to a larger plan.`,
        ];
      }
      break;
    case 'ceiling_90':
      subject = `${name} is close to its overage ceiling`;
      body = [
        `"${name}" has used ${usage} allowed this month, including overage.`,
        `${refused} at the ceiling of ${count(input.limit)} ${dimension} until it resets on ${resets}.`,
      ];
      break;
  }
  const link = context.portalUrl
    ? (() => {
        const url = new URL('/billing', context.portalUrl);
        url.searchParams.set('organization', input.organizationId);
        return ['', `Billing page: ${url.toString()}`];
      })()
    : [];
  return {
    subject,
    text: [
      ...body,
      '',
      'Upgrade or change your plan on the Billing page.',
      ...link,
    ].join('\n'),
  };
}
