# 0026 — Invoices, payments and proration

Status: accepted. Supersedes the billing timing of
[0024](0024-plans-and-pricing.md) ("a month is billed in full on the plan in
effect at its end").

MyanLex has plans, priced statements and plan-change requests
([0024](0024-plans-and-pricing.md), [0025](0025-plan-changes.md)), but no way to
say what a workspace owes or record that it paid. This decision adds
MyanLex-issued invoices that any payment method can settle, a proration rule for
mid-month upgrades, and what happens when an invoice goes unpaid.

## What the payment landscape requires

- **Stripe** doesn't onboard businesses registered in Myanmar. Using it needs a
  company and bank account in a supported country, and Myanmar-related payments
  may face sanctions review. Recurring card billing through Stripe is therefore
  not available to MyanLex yet.
- **Myanmar wallets and cards** (KBZPay, WavePay, AYA Pay, MPU) are one-time,
  pay-per-order payments: QR codes, redirects or app-to-app, confirmed by a
  signed callback (WavePay signs requests with an HMAC-SHA256 hash and a
  merchant secret). There is no stored payment method to charge each month, so
  the customer approves every payment. They can be reached one by one or through
  an aggregator such as Dinger, which offers one API for all of them for a
  monthly fee, but its card flows can't be tested before going live.
- **So billing can't depend on a provider.** MyanLex issues invoices and decides
  what is owed; a provider, a bank transfer or (later) a saved Stripe card only
  collects payment for an invoice.

## Billing model

- **Base fees are prepaid per UTC month; overage is billed in arrears.** The
  monthly invoice, issued on the 1st, holds the month's base fee for the plan in
  effect that day and the overage of the month just closed, copied from its
  closed statement (still priced on the plan in effect at that month's end).
- **Upgrades start immediately** (on approval) and issue a **proration invoice**
  for the rest of the month:
  - from Free or a zero-fee plan: `fee × remainingDays ÷ daysInMonth`;
  - from a paid plan in the same currency:
    `(newFee − oldFee) × remainingDays ÷ daysInMonth`.
  - Days are UTC calendar days and include the start day. Amounts are integer
    minor units rounded half up. A change starting on the 1st isn't prorated;
    the monthly invoice covers it.
- **Downgrades, moves to Free and currency changes start on the 1st** of a
  month, with no refunds or credits; the month is already paid. The API refuses
  `now` for them. One approved after its requested date waits for the next 1st.
  Prorating across currencies isn't possible, hence the currency rule.
- **Statements stay the usage record.** Their stored charges are unchanged; the
  portal labels them "usage pricing", and invoices are what is owed.
- `pnpm billing:assign` remains a raw operator tool and issues no invoice.

## Invoices

- **Numbering:** `MLX-<year>-<6 digits>`, gap-free per year. The next number
  comes from a locked `invoice_sequences` row in the issuing transaction, so a
  rolled-back issue doesn't use a number.
- **Immutable once issued:** triggers reject changes to an invoice's identity,
  period, currency or amounts, to its lines and to payments, and any deletion
  except with the organization. A deferred constraint trigger checks at commit
  that the lines add up to the subtotal, so lines can't be added later.
- **Statuses:** `open`, `paid` or `void` (with a reason). Only an open invoice
  changes. Mistakes are voided, not edited.
- **Monthly issuing is idempotent:** one monthly invoice per organization, month
  and currency (two only around a currency change), enforced by a partial unique
  index. A workspace whose previous month has usage but no closed statement
  waits until `usage:close-month` has run.

## Payments

- A payment settles an invoice in full: the amount and currency must match.
  Partial payments aren't supported yet.
- `method` is `bank_transfer`, `cash` or `provider`. Provider payments carry the
  provider name and its reference, unique together, so a replayed callback can't
  pay twice.
- `recordPayment` is the single entry point: operators call it through
  `pnpm billing:invoices mark-paid`, and provider callbacks will call it later.
- Payments and voids are audited (`billing.invoice_paid`,
  `billing.invoice_voided`), as is issuing (`billing.invoice_issued`).

## Dunning

- Invoices are due 7 days after issue. `pnpm billing:dunning` (daily) emails
  members with `billing.manage`: the invoice on the day of issue, then reminders
  on days 3 and 6.
- Once overdue, the workspace moves to Free (its limits apply), recorded as
  `billing.suspended_for_nonpayment`, and the invoice remembers the plan. Paying
  it restores that plan immediately (`billing.plan_restored`) unless the
  workspace has since chosen another plan or the plan was archived. A month
  already invoiced isn't charged again.
- Each reminder and the suspension happen once, so the job is safe to rerun.

## Adapters

`PaymentProvider` (`common/billing/payment-provider.ts`) is the contract for a
provider: create a payment for an invoice (hosted page, deep link or QR), and
verify its callback into `{ paid, externalRef, invoiceNumber, amount }`. The
callback route then calls `recordPayment`. Planned adapters, once chosen:

- **Myanmar:** an aggregator (Dinger) or KBZPay and WavePay directly. Each
  invoice gets a pay link; enabling one also lets plans use the `self_service`
  change policy (checkout) from 0025.
- **Stripe**, once a non-Myanmar entity exists: hosted payment for invoices, and
  a saved card to pay monthly invoices automatically.

## Not included

- Any provider adapter; partial payments; credit notes and refunds; taxes; PDF
  generation on the server (the portal's invoice page prints to PDF).
