# 0025 — Plan changes: an approval channel, ready for checkout

Status: accepted.

[0024](0024-plans-and-pricing.md) gave plans prices, but only an operator could
change a workspace's plan (`pnpm billing:assign`). This decision lets a
workspace ask for a plan in the portal, and sets the model for both ways a plan
will change:

- **Approval** (built now): a workspace Owner requests and an operator approves
  or rejects. It stays useful when a payment provider exists: for bank transfers
  and local wallets (KBZPay, WavePay) that can't take recurring card payments,
  and for custom or enterprise plans.
- **Checkout** (later): the Owner pays at a payment provider, and its webhook
  confirms payment and applies the change automatically.

Both channels end in the same step, so limits, statements, the audit log and "a
month is billed on the plan in effect at its end" behave the same whichever way
a change came. No money is charged by this change.

## Plan changes

- **One row per requested change** in `plan_changes`, whatever the channel: the
  plan moved from and to, the timing, a note, the requester (with an email
  snapshot), the decision (when, by whom, why) and, once applied, the
  subscription it created. `external_ref` is reserved for a provider's checkout
  id.
- **Statuses:**
  - open: `pending` (approval), `awaiting_payment` (checkout, reserved);
  - closed: `applied`, `rejected` (approval), `cancelled`, `expired` (checkout,
    reserved).
  - Check constraints tie statuses to channels, and closed rows have a decision
    time.
- **One open change per workspace**, by a partial unique index. A second request
  returns 409; concurrent requests can't both succeed.
- **Who and what:** members with `billing.manage` (reserved for this in 0024;
  Owners hold it) can request a public, unarchived plan other than the current
  one, or Free, and cancel a pending change. Requests and cancellations are
  audited as `billing.plan_change_requested` and `…_cancelled`.

## Timing

- `now` applies when the change is applied.
- `next_month` applies at 00:00 UTC on the 1st of the month after the request.
  If the change is applied after that date, it applies at that moment instead. A
  change never starts in the past, so closed months are never re-priced.
- Because a month is billed on the plan in effect at its end, `next_month` keeps
  the current month on the current plan.

## Applying a change

- `applyPlanChange` locks the change (it must be open) and the workspace, then
  calls `assignInTransaction`, the same step `pnpm billing:assign` uses. That
  ends or cancels other subscriptions, refuses archived plans and writes
  `billing.plan_changed`. The change becomes `applied`, linked to the new
  subscription (none for Free), and `billing.plan_change_applied` is recorded.
- If the plan was archived after the request, applying fails and the change
  stays `pending`, so the operator can reject it.
- `pnpm billing:changes list | approve | reject` is the operator side. Rejection
  needs a reason, which the requester sees, and is audited as
  `billing.plan_change_rejected`.

## Notifications

- A request emails `MYANLEX_BILLING_NOTIFY_EMAIL` when it is set.
- A decision emails the requester when the script has `SMTP_*` settings.
- Both are best-effort: mail failures never fail a request or a decision, and
  the API response and script output report `sent`, `failed`, `disabled` or
  `skipped`.

## Change policy

- `plans.change_policy` is `approval` (default) or `self_service`.
  `self_service` will mean "change through checkout". Until a payment provider
  exists the plan scripts refuse it and every request takes the approval
  channel.
- It is descriptive, not a term: it can change on a plan that is in use, and the
  0024 immutability trigger ignores it.
- `PaymentProvider` (`common/billing/payment-provider.ts`) is the interface the
  checkout channel will implement: start a checkout, handle a webhook, cancel a
  subscription. Nothing implements or injects it yet.

## For the checkout channel

- It will create changes in `awaiting_payment` with an `external_ref`, apply
  them from verified, idempotent webhooks through `applyPlanChange`, and expire
  abandoned checkouts.
- Open question: card customers usually expect upgrades to start at once with a
  prorated charge, while MyanLex bills a whole month on the plan in effect at
  its end. Decide this before checkout ships.

## Not included

- Payment collection, invoices, proration, refunds and trials.
- Automatic approval of any change.
