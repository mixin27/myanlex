# 0010 — Project usage reporting

Status: accepted.

Usage reports require a verified session, organization membership and the
current `usage.read` permission. Project selection in the console additionally
requires `project.read`. Keys cannot read platform reports. No linguistic code
changes.

GET `/v1/platform/organizations/:organizationId/projects/:projectId/usage`
accepts optional paired `from` and `to` UTC calendar dates (`YYYY-MM-DD`). Both
ends are inclusive, the maximum range is 90 days, dates must be on or after
1970-01-01, and future dates are rejected. Omitting both selects the last 30 UTC
days including today. Today's bucket is partial. Empty days are zero-filled.

Report totals and daily buckets come from one parameterized PostgreSQL aggregate
over persisted `api_usage` records, constrained by organization, project and a
half-open timestamp interval. The existing project/time index supports this
query. No rollup job or cache is introduced: repeated reads cannot double-count
an increment, and totals are derived from exactly the returned buckets. The
reserved `daily_usage` table remains unused until scale justifies an idempotent
rollup and explicit freshness policy. This is not a billing implementation.

Metrics are explicitly defined:

- Requests: persisted HTTP request records, not batch-item count.
- Errors: those records with HTTP status 400 or above. Partial item failures in
  successful batch responses are not HTTP errors.
- Characters: the existing `charactersProcessed` field counts submitted Unicode
  code points, including failed requests that reached the interceptor. The UI
  labels these as submitted characters; it does not claim successful processing.
- Processing time: sum of recorded handler durations in milliseconds, excluding
  guards, networking and usage persistence. Average is rounded to two decimals
  over all recorded requests (not an average of daily averages); no requests
  produces null.

Integer aggregates are decimal strings to preserve precision beyond JavaScript's
safe integer range. Reports include their UTC range, project ID, generation time
and fixed `best-effort` metering classification. They never include submitted
text, API-key secrets/hashes, account details or raw usage events.

The existing interceptor records asynchronously after API-key authentication and
guards. Bootstrap keys, session routes and pre-interceptor rejections (including
rate-limit rejections) are not counted. Persistence failures or process exits
can lose events. These limitations are visible in the console and contract; an
empty report means no recorded usage in that interval, not guaranteed zero
traffic. Durable billing metering remains separate work. Admission quotas are
implemented separately in [ADR 0011](0011-distributed-limits-and-quotas.md).
