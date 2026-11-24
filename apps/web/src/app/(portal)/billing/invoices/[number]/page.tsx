import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { readPlatform } from '@/lib/platform-server';
import type { Invoice, OrganizationAccess } from '@/lib/platform-types';
import { formatMoney } from '@/lib/money';
import { invoiceStatus } from '@/components/billing/invoices';
import { PrintButton } from '@/components/billing/print-button';
import { BillToBlock } from '@/components/billing/billing-details';

const day = (iso: string) => iso.slice(0, 10);
const methodLabel: Record<string, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  provider: 'Online payment',
};

/** A printable invoice ("Save as PDF" from the browser's print dialog). */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ organization?: string }>;
}) {
  const { number } = await params;
  const { organization: organizationId } = await searchParams;
  if (
    !/^MLX-[0-9]{4}-[0-9]{6}$/.test(number) ||
    !organizationId ||
    !z.uuid().safeParse(organizationId).success
  )
    notFound();
  const organization = await readPlatform<OrganizationAccess>(
    `organizations/${organizationId}`,
  );
  const invoice = await readPlatform<
    Invoice & { paymentInstructions: string | null }
  >(`organizations/${organizationId}/billing/invoices/${number}`);
  const money = (minor: string) => formatMoney(minor, invoice.currency);
  const status = invoiceStatus(invoice);
  return (
    <div className="invoice-print mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          className="text-sm underline"
          href={`/billing?organization=${organizationId}`}
        >
          Back to Billing
        </Link>
        <PrintButton />
      </div>
      <article className="space-y-6 rounded-xl border bg-white p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">
              Invoice
            </p>
            <h1 className="text-2xl font-semibold">{invoice.number}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              MyanLex · Myanmar language infrastructure
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Issued</dt>
            <dd className="tabular-nums">{day(invoice.issuedAt)}</dd>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="tabular-nums">{day(invoice.dueAt)}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className={status.tone}>{status.label}</dd>
          </dl>
        </header>
        <section aria-labelledby="bill-to-heading">
          <h2
            id="bill-to-heading"
            className="text-xs font-medium uppercase text-muted-foreground"
          >
            Bill to
          </h2>
          {/* As issued: later changes to billing details do not apply. */}
          <BillToBlock
            name={invoice.billTo?.name ?? organization.name}
            address={invoice.billTo?.address ?? null}
            taxId={invoice.billTo?.taxId ?? null}
            note={invoice.billTo?.note ?? null}
          />
        </section>
        <table className="w-full text-sm">
          <caption className="sr-only">Invoice lines</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={index} className="border-b">
                <td className="py-2">{line.description}</td>
                <td className="py-2 text-right tabular-nums">
                  {money(line.amountMinor)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="pt-3 text-left font-semibold">
                Total ({invoice.currency})
              </th>
              <td className="pt-3 text-right text-lg font-semibold tabular-nums">
                {money(invoice.totalMinor)}
              </td>
            </tr>
          </tfoot>
        </table>
        {invoice.payments.length > 0 && (
          <section className="space-y-1 text-sm">
            <h2 className="font-semibold">Payments</h2>
            {invoice.payments.map((payment, index) => (
              <p key={index}>
                {money(payment.amountMinor)} ·{' '}
                {methodLabel[payment.method] ?? payment.method} ·{' '}
                {day(payment.receivedAt)}
              </p>
            ))}
          </section>
        )}
        {invoice.status === 'void' && (
          <p className="text-sm text-muted-foreground">
            Voided {invoice.voidedAt && day(invoice.voidedAt)}:{' '}
            {invoice.voidReason}
          </p>
        )}
        {invoice.status === 'open' && (
          <section className="space-y-1 text-sm">
            <h2 className="font-semibold">How to pay</h2>
            <p className="whitespace-pre-line">
              {invoice.paymentInstructions ??
                'Contact the MyanLex team for payment details.'}
            </p>
            <p className="text-muted-foreground">
              Include {invoice.number} with your payment.
              {invoice.suspended &&
                ' Paying it restores the workspace’s plan straight away.'}
            </p>
          </section>
        )}
      </article>
    </div>
  );
}
