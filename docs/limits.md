# Rate limits and monthly quotas

## Local setup

```sh
docker compose --profile redis up -d
pnpm db:deploy
pnpm db:seed
```

Set these in `apps/api/.env`, then restart the API:

```dotenv
REDIS_URL=redis://localhost:6379
MYANLEX_REDIS_PREFIX=myanlex
MYANLEX_QUOTAS_ENABLED=true
```

Quota enforcement defaults to `false`. Redis is optional for a single instance,
but required when scaling the API across processes or hosts. All replicas must
use the same Redis database, prefix, `MYANLEX_RATE_LIMIT_MAX` (default 60), and
`MYANLEX_RATE_LIMIT_WINDOW_MS` (default 60000). Use separate prefixes for
separate deployments. Do not change prefixes to avoid an active allowance.

Compose binds Redis to loopback for local development. Production needs private
network access, authentication/ACLs, and TLS (`rediss://`) where appropriate.
Keep Redis credentials out of source control. The local service uses a named
volume, AOF persistence, and `noeviction`; do not flush counters on deployment.
Redis outages or memory exhaustion return `503`, not a fresh local allowance.
Asynchronous persistence/failover may lose recent short-window counters; this
limiter is admission protection, not a financial accounting system.

## Scope and accounting

- Short-window limits apply per persisted API key, per session user, or per
  bootstrap credential. Identities are hashed before becoming Redis keys.
- Public health/documentation and Better Auth's own routes are outside this
  limiter. Better Auth retains its existing independent rate-limit storage.
- Monthly quotas apply only to persisted API keys. Sessions and bootstrap keys
  do not consume monthly quotas. Remove the bootstrap key in production if its
  bypass is inappropriate for your deployment.
- An organization shares its monthly request and character allowances across all
  projects and keys. Replacing or revoking a key does not reset consumption.
- A batch reserves one request and the sum of submitted Unicode code points. A
  single operation reserves one request and its submitted code points.
- Reservations happen after authentication/permission and burst-limit guards,
  before validation/handler execution. Later validation errors, processing
  errors, or disconnects are not refunded. Missing/non-string text contributes
  zero characters. Requests rejected by quotas consume neither quota dimension,
  but have already consumed a short-window request.
- HTTP/parser or earlier guard rejections do not consume monthly quota. Usage
  charts remain best-effort completed-event reports and can differ from quota
  reservations. Neither is presently billing-grade metering.

## Plans, rollout, and failures

The applicable subscription has status `active`, `startsAt <= database time`,
and no `endsAt` or `endsAt > database time`. With no such subscription, the
seeded `free` plan applies (10,000 requests / 1,000,000 characters). Null plan
limits mean unlimited; zero denies that dimension's consumption. More than one
applicable subscription, negative limits, a missing Free plan, or a database
failure returns `503`. No paid plans, prorating, trial/cancellation semantics,
or billing integrations are invented here.

The quota period is a UTC calendar month, selected using the database
transaction start time. PostgreSQL atomically reserves both dimensions in
`organization_quotas`. Concurrent requests cannot exceed either configured
limit. Plan changes affect subsequent reservations without resetting counters;
an in-flight request uses the plan it read at transaction start. Existing
counters survive API/Redis restarts and do not depend on asynchronous usage
persistence.

First enablement starts counting new admitted traffic; historical usage is not
backfilled. Disabling enforcement stops counting; re-enabling resumes the same
month's ledger. Roll out the setting consistently across all replicas,
preferably at a UTC month boundary. Do not disable it temporarily and expect the
omitted traffic to appear later. Old ledger rows are retained; retention policy
is future operational work.

HTTP `429` uses `rate_limited` for short windows or `quota_exceeded` for monthly
quotas. `Retry-After` gives seconds until that allowance resets. `RateLimit-*`
headers always describe the short window, not monthly quotas.
`503 service_unavailable` means enforcement could not safely decide; clients
should retry with backoff. A network timeout can leave a reservation committed
even if the caller received no success; there is no automatic replay/refund.

## Tests

Use disposable services; never point integration tests at a production database.
Under `NODE_ENV=test`, the API does not load `apps/api/.env`; service URLs must
come from explicit test options or the test process environment. Apply
migrations and seed the Free plan, then run:

```sh
MYANLEX_TEST_DATABASE_URL=postgresql://... \
MYANLEX_TEST_REDIS_URL=redis://localhost:6379 pnpm check
```

CI provisions both services and runs the same tests, including concurrent
callers, multi-instance rate limits, UTC/non-UTC database sessions, tenant
isolation, plan changes, and HTTP failure responses. No browser automation is
needed.
