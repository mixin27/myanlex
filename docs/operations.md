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
- Each month is billed in full on the plan in effect at its end, without
  proration. Schedule changes for 00:00 UTC on the first of a month to bill
  exactly from then.
- Starts cannot be in the past.
- `free` ends the paid subscription.
- Every change is recorded in the workspace audit log as `billing.plan_changed`.

**Monthly invoicing routine:**

1. After the month ends, run `pnpm usage:close-month`.
2. Read each workspace's statement (portal Usage page, or the statements API)
   and invoice its `charges.totalMinor` in `charges.currency`.
3. Investigate statements that don't reconcile before invoicing them.

Set `MYANLEX_BILLING_CONTACT` (an email address or short text) on the portal to
tell customers how to change plan.
