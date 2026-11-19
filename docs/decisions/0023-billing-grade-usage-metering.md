# 0023 — Billing-grade usage metering

Status: accepted.

Monthly quotas ([limits](../limits.md)) counted admitted requests exactly, but
only as counters, and only while `MYANLEX_QUOTAS_ENABLED` was on. Usage reports
([0010](0010-usage-reporting.md)) were written after each response on a
best-effort basis. Neither could support a bill. This decision adds a usage
ledger and monthly statements. Plans, prices and a payment provider are later
work.

## What is billable

- **The billable unit is an admitted request:** one counted once it passes
  authentication, permission, burst-limit and quota checks, before validation or
  handler execution. It is not refunded if the request later fails validation,
  errors or disconnects. This is exactly what quota reservations count, so a
  statement equals the quota counter for the same month.
- Each request carries one request unit and the number of Unicode code points
  submitted, the same character count quotas reserve.
- **Sources:** persisted API keys, and portal playground runs, which reserve the
  same organization quota. Bootstrap keys and other session routes are not
  metered.
- The response status is not part of the billable record. Diagnostics in
  `api_usage` keep it, linked by `usage_event_id`.

## Always on

- Metering runs whether or not enforcement is enabled. The flag only decides
  whether plan limits can deny a request. Before this change, disabling
  enforcement stopped counting.
- A request that cannot be metered is refused with 503 rather than served
  unmetered. Persisted API keys already need the database to authenticate, so
  this adds no new outage mode. Playground runs now need it too.

## Ledger

- `usage_events` holds one row per admitted request: organization, project, API
  key (null for the playground), source, month, request units, characters, route
  template and request id. Request text is never stored.
- **Same transaction:** the row is inserted in the transaction that increments
  `organization_quotas`. A denied request writes neither; an admitted one writes
  both or neither. The ledger and the counter cannot diverge for traffic after
  deployment.
- **Database time** decides the month, as quotas already do, so API replicas
  agree at month boundaries.
- **Append-only:** a trigger rejects `UPDATE`. Rows are deleted only by
  retention cleanup, and only for months that have a closed statement, or when
  their organization, project or key is deleted. The application has no route
  that deletes any of those.

## Statements

- `pnpm usage:close-month` writes one `usage_statements` row per organization
  and finished month, from the ledger, with the quota counter, the plan in
  effect at the end of the month, and a breakdown by project, source and key.
- A month is closed only an hour after it ends, so no reservation transaction
  can still be committing to it. Closing is idempotent, so cron can run it
  daily.
- Statements are immutable: a trigger rejects `UPDATE`, and `DELETE` except when
  the organization itself is deleted.
- `reconciled` records whether ledger totals equal the counter. The month of
  deployment is expected to differ, because the counter already held
  reservations from before the ledger existed. Any other mismatch makes the
  script exit non-zero and needs investigation.
- Until a month is closed, the API sums it live from the ledger.

## Retention

- Ledger rows are kept for `MYANLEX_USAGE_RETENTION_MONTHS` full months before
  the current one: 13 by default, which is also the minimum, enough to answer a
  dispute about any month in the past year. `pnpm usage:cleanup` deletes older
  closed months in batches of 500 with `SKIP LOCKED`.
- Statements are kept permanently.

## Reading

- `GET /v1/platform/organizations/:id/usage-statements?month=YYYY-MM` and
  `…/usage-statements/:month/events.csv` require a verified session and
  `usage.read`. Non-members get 404. The CSV streams every ledger line with
  formula-safe escaping, and returns 410 past retention.
- The portal's Usage page shows the statement above the daily activity charts,
  with a month picker, the breakdown and a CSV link.

## Not included

- Plans, prices, invoices, taxes, payment providers, proration, trials and
  overage billing.
- Refunds or credits for failed requests.
- Partitioning `usage_events` by month. Consider it when the table outgrows a
  single index scan per statement.
