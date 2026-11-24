# Readiness and operational metrics

## Probes

`GET /v1/health` remains the public liveness contract:
`{ "status": "ok", "version": "..." }`. Dependency outages must not trigger
liveness restart loops.

Use `GET /v1/health/ready` for traffic readiness. It returns only
`{ "status": "ready" }` (200) or `{ "status": "not_ready" }` (503), with no
credentials or dependency diagnostics. It is public and bypasses quotas and rate
limits. Protect probe traffic at your deployment edge as appropriate.

Readiness checks run concurrently, share a single in-flight run, and cache both
success and failure for one second. PostgreSQL uses a dedicated
single-connection pool with one-second connection/query timeouts and a server
statement timeout. Redis uses PING on the actual limiter client with a
two-second response deadline in addition to its queue timeout. An expired
response closes the connection, rejects pending work and reconnects for future
requests only; timed-out writes are not retried because their outcome is
unknown. A failed request can therefore have consumed a short-window allowance.
No limiter counter or usage record is written by a probe. Dependencies without
configuration are skipped, so NLP-only deployments remain supported. Readiness
is false before application bootstrap and once shutdown begins.

These checks establish connectivity, not schema migrations, application-pool
capacity, database permissions, Redis script permissions, SMTP or OAuth health.
Run migrations and deployment smoke checks separately. Configure an orchestrator
probe timeout of at least five seconds and suitable failure thresholds; cache
windows mean detection is not instantaneous.

## Protected Prometheus endpoint

Metrics are disabled by default. Generate a separate token with
`openssl rand -hex 32`, then set `MYANLEX_METRICS_TOKEN` in `apps/api/.env` or
the process environment and restart the API. Accepted tokens contain 32–256
URL-safe letters, digits, underscores or hyphens. Do not reuse an NLP API key or
auth secret.

Scrape `GET /internal/metrics` using `Authorization: Bearer <operator-token>`.
Without configuration the route is absent (404); missing/invalid credentials
receive 401. Responses are never cacheable. This is an operator endpoint, not a
public SDK operation, and bypasses tenant quotas. Never expose the token through
`NEXT_PUBLIC_*` or browser dashboards. Restrict this path to a private network
or an authenticated ingress and use TLS. Do not publish it through the web
proxy.

Example Prometheus job (adapt the host and mount a token file securely):

```yaml
scrape_configs:
  - job_name: myanlex-api
    metrics_path: /internal/metrics
    scheme: https
    authorization:
      type: Bearer
      credentials_file: /run/secrets/myanlex_metrics_token
    static_configs:
      - targets: ['api.internal.example:443']
```

Per-process metrics are reset on restart. Scrape every replica separately:

- `myanlex_http_requests_total`: completed requests, labeled by method,
  registered route template (or `unmatched`) and status code.
- `myanlex_http_request_duration_seconds`: histogram with the same labels;
  measured from request receipt through response completion, not just NLP work.
- `myanlex_http_requests_aborted_total`: observed aborted bodies by
  method/route, not guaranteed coverage of every disconnect.
- `myanlex_process_resident_memory_bytes` and `myanlex_process_uptime_seconds`:
  process-level gauges collected on scrape.

Liveness, readiness and metrics traffic are excluded from request metrics.
Submitted text, query strings, tokens, request IDs, tenant IDs, user IDs, IPs
and path parameter values are never metric labels. Unknown URLs share one series
per method/status. Metrics are aggregate operational telemetry, not billing
records.

Example five-minute 5xx fraction (guard against an empty denominator):

```promql
sum(rate(myanlex_http_requests_total{status_code=~"5.."}[5m]))
/
clamp_min(sum(rate(myanlex_http_requests_total[5m])), 0.001)
```

See [monitoring and staging validation](staging-validation.md) for the optional
local monitoring stack, tested provisional alert rules, isolated outage
rehearsal and explicitly authorized staging load runner. Actual notification
delivery, staging capacity evidence and on-call routing remain release gates.

Implementation references:
[Prometheus Node.js client](https://github.com/prometheus/client_js),
[node-postgres pool API](https://node-postgres.com/apis/pool).

## Audit log retention

Platform audit events (see
[platform](platform.md#audit-log-and-ownership-transfer)) are kept until the
cleanup job removes them. Schedule it daily:

```sh
DATABASE_URL='<database connection>' MYANLEX_AUDIT_RETENTION_DAYS=365 pnpm audit:cleanup
```

- The retention value must be an integer of at least 30. The default is 365.
- Each run deletes up to 50,000 rows, in batches of 500 using `SKIP LOCKED`.
  Rerun it to clear a larger backlog.
- Backups keep their own retention.

## Usage statements and ledger retention

Billable usage is recorded in the `usage_events` ledger (see
[0023](decisions/0023-billing-grade-usage-metering.md)). Schedule both jobs
daily, close first:

```sh
DATABASE_URL='<database connection>' pnpm usage:close-month
DATABASE_URL='<database connection>' MYANLEX_USAGE_RETENTION_MONTHS=13 pnpm usage:cleanup
```

- `usage:close-month` writes an immutable statement for every organization and
  month that ended more than an hour ago and has none. It is idempotent.
- It exits with status 2 and lists the organizations and months whose ledger
  totals differ from the quota counter. The month metering was first deployed is
  expected to differ, because its counter already held earlier reservations. Any
  other mismatch means a reservation was written without its ledger row, or a
  row was removed outside cleanup: investigate before billing that month.
- `usage:cleanup` deletes ledger rows for closed months older than the retention
  period, in batches of 500 using `SKIP LOCKED`, up to 50,000 rows per run. The
  retention value must be an integer of at least 13; the default is 13. Set the
  same value for the API, which uses it to refuse CSV downloads for expired
  months with 410. Statements are kept permanently.
- If the database is unavailable, API-key and playground requests return 503
  rather than running unmetered.
- Closed statements carry the month's charges, priced on the plan in effect at
  the end of the month. Months on a subscription are closed even without
  traffic, so the base fee is billed. Two close runs at once are safe: each
  month is written once.

## Plans and pricing

Plans and assignments are managed only with these scripts (see
[0024](decisions/0024-plans-and-pricing.md)). There is no payment provider:
invoice from the closed statements.

Define or update a plan from a JSON file:

```json
{
  "slug": "pro",
  "name": "Pro",
  "description": "For production apps",
  "public": true,
  "currency": "MMK",
  "baseFeeMinor": 50000,
  "monthlyRequestLimit": 100000,
  "monthlyCharacterLimit": 10000000,
  "overageMode": "allow",
  "requestBlock": 1000,
  "requestBlockPriceMinor": 500,
  "characterBlock": 100000,
  "characterBlockPriceMinor": 300,
  "requestCeiling": 200000,
  "characterCeiling": null
}
```

```sh
DATABASE_URL='<database connection>' pnpm billing:plans upsert pro.json
DATABASE_URL='<database connection>' pnpm billing:plans list
DATABASE_URL='<database connection>' pnpm billing:plans archive pro
```

- **Amounts** are integers in the currency's minor units, using its standard
  digits: MMK has none, USD has two (`2900` is $29.00). Large values may be
  given as strings.
- **Overage modes:**
  - `block` refuses requests at the allowance;
  - `allow` bills every started block above it, and stops at a ceiling when one
    is set.
- **Once any workspace has used a plan, its terms are fixed** (the database
  enforces this too). Only `name`, `description` and `public` can change. To
  change a price, create a new plan with a new slug, move workspaces to it and
  archive the old one. Archived plans can't be assigned, but their current
  subscriptions continue.

Assign a plan:

```sh
DATABASE_URL='<database connection>' pnpm billing:assign acme pro --actor ops@example.com --note "Order 42"
DATABASE_URL='<database connection>' pnpm billing:assign acme team --actor ops@example.com --starts-at 2027-01-01T00:00:00Z
DATABASE_URL='<database connection>' pnpm billing:assign acme free --actor ops@example.com
```

- The change applies to limits from its start time.
- `billing:assign` changes the plan only; it issues no invoice. Use plan change
  requests (below) when a change should be invoiced, or schedule assignments for
  00:00 UTC on the 1st so the monthly invoice covers them.
- Starts cannot be in the past.
- `free` ends the paid subscription.
- Every change is recorded in the workspace audit log as `billing.plan_changed`.

Invoicing is automatic; see [invoices and payments](#invoices-and-payments).

Set `MYANLEX_BILLING_CONTACT` (an email address or short text) on the portal to
tell customers who to contact with billing questions.

### Plan change requests

Workspace Owners request plan changes on the Billing page (see
[0025](decisions/0025-plan-changes.md)). Review them with:

```sh
DATABASE_URL='<database connection>' pnpm billing:changes list
DATABASE_URL='<database connection>' pnpm billing:changes approve <change-id> --actor ops@example.com
DATABASE_URL='<database connection>' pnpm billing:changes reject <change-id> --actor ops@example.com --reason "Annual agreement needed first"
```

- `list` shows open changes; `list --all` shows the latest 100 of any status.
- **Approving** applies the plan exactly as `billing:assign` would.
  - A "from next month" change starts on the 1st of the month after the request,
    or immediately if that date has passed; the output says which.
  - A plan archived since the request can't be applied: reject the change
    instead.
- **Rejecting** needs a reason, which the Owner sees on the Billing page.
- **Emails:**
  - Set `MYANLEX_BILLING_NOTIFY_EMAIL` on the API to receive an email for each
    new request.
  - With the same `SMTP_*` variables as the API, the script emails the requester
    the decision; without them it prints `Requester email: skipped`.
  - Mail failures never undo a decision.
- **Billing:** approving an upgrade that starts now issues a prorated invoice
  for the rest of the month and emails it. Downgrades, moves to Free and
  currency changes always start on the 1st of a month; one approved after its
  date waits for the next 1st.
- **Change policy:** plan files accept `"changePolicy": "approval"` (the
  default). `self_service` is refused until a payment provider (checkout)
  exists.

## Invoices and payments

MyanLex issues its own invoices; see
[0026](decisions/0026-invoices-and-payments.md). Base fees are billed in advance
each month and prorated by day for upgrades; overage is billed after the month
closes. There is no payment provider yet, so you record payments.

These run daily, in this order, after `usage:close-month`. The
[daily run](#the-daily-run) does it for you:

```sh
DATABASE_URL='<database connection>' pnpm usage:close-month
DATABASE_URL='<database connection>' pnpm billing:invoices issue-monthly
DATABASE_URL='<database connection>' pnpm billing:dunning
DATABASE_URL='<database connection>' MYANLEX_USAGE_RETENTION_MONTHS=13 pnpm usage:cleanup
```

- **`issue-monthly`** issues each workspace's invoice for the current month: the
  base fee of the plan in effect on the 1st, plus the overage of the month just
  closed. It is idempotent.
  - A workspace whose previous month has no closed statement yet is skipped and
    listed, and the script exits with status 2. Run `usage:close-month` first.
  - Use `--month YYYY-MM` to issue a past month that was missed.
- **`billing:dunning`** emails new invoices and reminders (on the day of issue
  and days 3 and 6) to the workspace's confirmed billing emails, or to members
  with `billing.manage` when it has none (set on the Billing page; see
  [billing details](platform.md#billing-details)).
  - Invoices are due 7 days after issue.
  - On day 7 an unpaid invoice moves its workspace to Free, so Free limits
    apply. It records `billing.suspended_for_nonpayment` and emails the
    workspace.
- **Recording a payment:**

  ```sh
  DATABASE_URL='<database connection>' pnpm billing:invoices list --status open
  DATABASE_URL='<database connection>' pnpm billing:invoices mark-paid MLX-2026-000123 --method bank_transfer --reference "KBZ transfer 0091" --actor ops@example.com
  ```

  - Payments must be for the full total; there are no partial payments.
  - Marking an invoice paid emails a receipt, and if dunning had moved the
    workspace to Free, restores the plan immediately.

- **Wrong recipient or bill-to:** workspaces fix their own billing details on
  the Billing page. Details apply to invoices issued afterwards;
  `billing:invoices show <number>` shows what an issued invoice was billed to.
  To correct an open invoice, void it and issue a new one.
- **Voiding:** `void <number> --reason … --actor …` cancels an open invoice
  issued in error. Issued invoices can't be edited or deleted; the database
  enforces this.
- **Numbering:** invoices are numbered `MLX-<year>-<6 digits>` with no gaps.
- **Email settings:**
  - Set `MYANLEX_BILLING_PAYMENT_INSTRUCTIONS` (for example your bank account)
    on the API and in the scripts' environment. It appears on invoices, on the
    Billing page and in emails.
  - Set `AUTH_PUBLIC_URL` in the scripts' environment to include portal links.
  - Emails need the `SMTP_*` variables; without them the scripts report
    `skipped`.

## The daily run

`pnpm ops:daily` is the single entry point for cron
([0027](decisions/0027-self-hosted-dokploy.md)). In the production stack, the
`jobs` container runs it at 00:30 UTC (`infra/crontab`). Elsewhere, schedule it
once a day after midnight UTC.

| Order | Step               | Script                                            |
| ----- | ------------------ | ------------------------------------------------- |
| 1     | backup             | `ops:backup`, only when `BACKUP_S3_BUCKET` is set |
| 2     | close-month        | `usage:close-month`                               |
| 3     | issue-invoices     | `billing:invoices issue-monthly`                  |
| 4     | dunning            | `billing:dunning`                                 |
| 5     | usage-cleanup      | `usage:cleanup`                                   |
| 6     | audit-cleanup      | `audit:cleanup`                                   |
| 7     | playground-cleanup | `playground:cleanup`                              |

- **Billing stops at its first failure.** If close-month fails, invoices aren't
  issued from an unclosed month and dunning doesn't run. Every step is
  idempotent, so the next run, or a manual one after you fix the cause, resumes.
- **A failed backup or cleanup doesn't stop billing**, but the run still fails.
- **Exit codes:**
  - `0`: everything succeeded;
  - otherwise, the first failed step's code (for example `2` when close-month
    finds a ledger that doesn't reconcile);
  - `75`: another run holds the lock (a Postgres advisory lock), so nothing ran;
  - `1`: the run couldn't start.
- **Logs** are one JSON line per step (`ops_step`: step, outcome, exit code,
  duration), then an `ops_daily` summary. The scripts' own lines appear in
  between. No secrets or email addresses are logged.
- **Heartbeat:** set `MYANLEX_HEARTBEAT_URL` to a Healthchecks.io check (https
  only), with a daily schedule and 1 hour of grace. The run pings `/start`, then
  the URL itself on success or `/<exit code>` on failure, with each step's
  outcome in the body. You're alerted both when a run fails and when none
  happens (the server is down or cron is broken). A heartbeat outage never fails
  the run.
- **Running it by hand** on the server:

  ```sh
  docker exec myanlex-production-jobs-1 pnpm ops:daily
  docker exec myanlex-production-jobs-1 pnpm billing:invoices list --status open
  ```

### Backups

When `BACKUP_S3_*` is set, `ops:backup`:

- runs `pg_dump --format=custom` of `DATABASE_URL`;
- uploads it to `<bucket>/<prefix>/myanlex-<UTC time>.dump`;
- deletes this job's dumps older than `BACKUP_RETENTION_DAYS` (default 14).

Credentials reach `pg_dump` through libpq variables, not its command line. Use a
private bucket and a token scoped to that bucket only, and add a bucket
lifecycle rule as a second line of defence. Restore into a **new, empty**
database as described in the [deployment runbook](deployment.md), and repeat the
drill after major upgrades.

## Production configuration check

`pnpm config:check` validates the API environment and prints the names of
invalid variables, never their values. It exits with `78` when the configuration
is invalid. With `MYANLEX_ENV=production`, it also requires:

- `NODE_ENV=production`;
- `AUTH_ENABLED=true`, an `AUTH_SECRET` of 32 characters or more, and an https
  `AUTH_PUBLIC_URL`;
- `SMTP_HOST`, `SMTP_PORT` and `SMTP_FROM`;
- `REDIS_URL`, `MYANLEX_QUOTAS_ENABLED=true` and `MYANLEX_METRICS_TOKEN`;
- `MYANLEX_BILLING_PAYMENT_INSTRUCTIONS`;
- a `DATABASE_URL` without `sslmode=disable`;
- no `MYANLEX_API_KEY` (the bootstrap key).

The production stack runs it before migrations, so a bad configuration stops the
deploy before anything changes. The API applies the same rules at boot.

## Client addresses behind proxies

Rate limits for unauthenticated requests and sign-in limits key on the client
address. Behind Traefik (and Cloudflare), set `MYANLEX_TRUST_PROXY` to a
comma-separated list of the proxies' addresses or CIDR ranges. Leave it `false`
(the default) when the API is reached directly. A hop count or `true` is
refused, because either would let a client choose its own address. See the
[Dokploy runbook](dokploy-runbook.md#client-addresses) for the exact values.
