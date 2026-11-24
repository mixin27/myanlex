import Link from 'next/link';
import type { BillingOverview, Invoice } from '@/lib/platform-types';
import { formatMoney } from '@/lib/money';

const day = (iso: string) => iso.slice(0, 10);
const lastDay = (iso: string) =>
  new Date(new Date(iso).getTime() - 1).toISOString().slice(0, 10);

export function invoiceStatus(invoice: Invoice) {
  if (invoice.status === 'paid')
    return { label: 'Paid', tone: 'text-emerald-800' };
  if (invoice.status === 'void')
    return { label: 'Void', tone: 'text-muted-foreground' };
  if (invoice.overdue)
    return { label: 'Overdue', tone: 'text-red-700 font-medium' };
  return { label: 'Open', tone: 'text-amber-800' };
}

export const invoiceHref = (organizationId: string, number: string) =>
  `/billing/invoices/${number}?organization=${organizationId}`;

/** Overdue and suspension notices, with how to pay. */
export function BillingAlerts({
  organizationId,
  outstanding,
  suspended,
  paymentInstructions,
}: {
  organizationId: string;
  outstanding: BillingOverview['outstanding'];
  suspended: BillingOverview['suspended'];
  paymentInstructions: string | null;
}) {
  const overdue = outstanding.filter((balance) => balance.overdue);
  if (!suspended && overdue.length === 0) return null;
  return (
    <section
      role="alert"
      className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-950"
    >
      {suspended ? (
        <p className="font-medium">
          This workspace moved to the Free plan because invoice{' '}
          <Link
            className="underline"
            href={invoiceHref(organizationId, suspended.invoiceNumber)}
          >
            {suspended.invoiceNumber}
          </Link>{' '}
          is overdue. Paying it restores the {suspended.plan} plan straight
          away.
        </p>
      ) : (
        <p className="font-medium">
          Overdue:{' '}
          {overdue
            .map((balance) => formatMoney(balance.totalMinor, balance.currency))
            .join(' and ')}
          . Unless it’s paid, the workspace moves to the Free plan.
        </p>
      )}
      {paymentInstructions && (
        <p className="whitespace-pre-line">
          <span className="font-medium">How to pay: </span>
          {paymentInstructions}
        </p>
      )}
    </section>
  );
}

export function InvoiceList({
  organizationId,
  invoices,
}: {
  organizationId: string;
  invoices: Invoice[];
}) {
  return (
    <section
      aria-labelledby="invoices-heading"
      className="space-y-3 rounded-xl border bg-white p-5"
    >
      <h2 id="invoices-heading" className="font-semibold">
        Invoices
      </h2>
      {invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No invoices yet. Paid plans are invoiced at the start of each month,
          and upgrades for the rest of the month they start.
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Invoices, newest first, UTC</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">Invoice</th>
              <th className="py-2 font-medium">Period</th>
              <th className="py-2 text-right font-medium">Total</th>
              <th className="py-2 pl-6 font-medium">Due</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => {
              const status = invoiceStatus(invoice);
              return (
                <tr key={invoice.number} className="border-b last:border-0">
                  <td className="py-2">
                    <Link
                      className="font-medium underline"
                      href={invoiceHref(organizationId, invoice.number)}
                    >
                      {invoice.number}
                    </Link>
                  </td>
                  <td className="py-2 tabular-nums">
                    {day(invoice.periodStart)} – {lastDay(invoice.periodEnd)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(invoice.totalMinor, invoice.currency)}
                  </td>
                  <td className="py-2 pl-6 tabular-nums">
                    {day(invoice.dueAt)}
                  </td>
                  <td className={`py-2 ${status.tone}`}>{status.label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
