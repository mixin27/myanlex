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
