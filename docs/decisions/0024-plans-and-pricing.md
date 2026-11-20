# 0024 — Plans, prices and charges

Status: accepted.

[0023](0023-billing-grade-usage-metering.md) made usage billable: an append-only
ledger and immutable monthly statements. This decision puts prices on those
statements. It does not collect money. Operators define plans, assign them to
workspaces, and invoice from the closed statements. A payment provider and
self-service plan changes are later work.

## Plans

- **A plan is allowance plus overage:** a monthly base fee includes request and
  character allowances (null is unlimited). Each dimension has a block size and
  a block price for usage above the allowance.
- **The overage mode is set per plan:**
  - `block` refuses requests at the allowance with 429, as Free always has;
  - `allow` admits usage above the allowance and bills it, up to optional
    request and character ceilings. With enforcement on, admission stops at the
    ceiling.
- **One currency per plan:** an ISO 4217 code, with every amount an integer in
  that currency's minor units. Digits follow the currency's standard (CLDR)
  digits: MMK has none, USD has two. Money is never a floating-point number in
  the database, the API or the pricing code.
- The migration gives existing plans, including Free, a zero fee in MMK with
  `block` overage, which is how they already behaved.
- **Plan terms are immutable once used.** A trigger rejects any change to the
  limits, fee, currency, overage mode, blocks, prices or ceilings of a plan that
  any subscription references. A new price means a new plan (`pro-2027`); the
  old one is archived so it cannot be assigned again. Name, description and the
  `public` flag stay editable.

## Charges

- **Which plan bills a month:** the one in effect at the month's last
  millisecond (UTC), the same plan the statement snapshots. It bills the whole
  month: there is no proration. A mid-month change takes effect for limits
  immediately.
- **The charge** is the base fee, plus overage for each dimension:
  `ceil(max(0, usage − allowance) / block) × block price`. Every started block
  is charged.
- Usage is the ledger total for the month, not the quota counter (they differ
  only in the month metering was deployed).
- Block plans never bill overage. Usage can exceed a block plan's allowance only
  while enforcement was off.
- `pnpm usage:close-month` stores the charges on the statement. Statements are
  immutable, so a closed month's charges never change. Months closed before this
  change have null charges and show as "Not priced".
- **Paid months without traffic still close:** a month is also closed when a
  subscription is in effect at its end, so the base fee is charged without
  traffic. Only months from when the subscription was recorded onward count;
  nothing is billed retroactively.
- Open months, and the Billing page, show an estimate on the current plan.

## Subscriptions

- `pnpm billing:assign <workspace> <plan> --actor <email>` is the only way to
  change a plan.
  - It locks the organization row.
  - It ends the subscription in effect at the start time and cancels later
    scheduled ones.
  - It starts the new one; the plan `free` just ends the current one.
  - It writes a `billing.plan_changed` audit event with the operator's email.
- **Starts cannot be in the past**, so a closed month is never re-priced.
- **No overlaps:** an exclusion constraint (`btree_gist`) guarantees that at
  most one active subscription covers any instant for an organization. The
  runtime ambiguity check stays as a fallback.

## Reading

- `GET /v1/platform/organizations/:id/billing` requires `billing.read`. It
  returns:
  - the current plan;
  - this month's estimate;
  - plan history;
  - public plans.
- Statements carry `charges`. The quota report adds `overageMode`, `ceiling` and
  `overage`.
- The portal has a Billing page, and the statement panel shows charges.
- `billing.manage` stays reserved for self-service plan changes.

## Not included

- Payment collection, invoices as documents, taxes, credits, refunds, discounts,
  proration and trials.
- Self-service plan changes, and a pricing page outside the portal.
- Currency conversion: a plan's currency is fixed, and a workspace changes
  currency only by changing plan.
