# Monitoring and staging validation

## Local monitoring stack

The separately named `compose.monitoring.yaml` project does not change the
application Compose services. It provides Prometheus (localhost:9090),
Alertmanager (localhost:9093), and an unexposed blackbox readiness probe. Images
are pinned; Prometheus retention is capped at seven days and 1 GB. This is a
local example, not a hardened publicly accessible monitoring service.

1. Enable API metrics on port 3001 as described in [operations](operations.md).
2. Store the exact operator token (no `Bearer` prefix) in an ignored file, such
   as `local/monitoring-metrics-token`. Keep it readable by the container user,
   but do not commit it or expose it to other host users.
3. Set `MYANLEX_METRICS_TOKEN_FILE` to that file's absolute path, then run:

```sh
docker compose -f compose.monitoring.yaml up -d
pnpm monitoring:check
```

Prometheus scrapes the API via `host.docker.internal:3001` and checks readiness
through blackbox. For staging, replace **both** target lists, use HTTPS and
private networking, and list every replica. Never pass credentials in URLs. Do
not expose blackbox's arbitrary-target probe interface publicly.

Prometheus Targets must show both jobs up and `probe_success` must be 1. A bad
metrics token should make the metrics job down. View Alerts in Prometheus and
Alertmanager to inspect delivery between those services.

**No external notifications are sent by default.** The Alertmanager receiver is
intentionally UI-only. Before staging sign-off, configure your approved private
email/chat/paging receiver using secrets, send a synthetic alert, verify both
firing and resolution at the receiver, and record the responsible on-call owner.
Do not consider a green configuration check proof of notification delivery.

Use `docker compose -f compose.monitoring.yaml down` to stop the stack; omit
`--volumes` to preserve its time-series and alert state.

## Initial alert policy and response

These are provisional thresholds, not published SLAs. Tune them against
representative staging traffic and agreed latency budgets.

| Alert               | Trigger / hold                                                 | First checks                                                                                      |
| ------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Metrics unavailable | Failed or missing target, 2 minutes                            | API process, operator token, scrape path, network                                                 |
| Not ready           | Failed readiness/probe exporter or missing target, 2 minutes   | PostgreSQL/Redis connectivity, then recent deployments; do not restart-loop on dependency failure |
| High server errors  | More than 5% 5xx, over 1 request/second, 5 minutes             | Status distribution and sanitized logs; distinguish dependency failures from input 4xx/quotas     |
| High latency        | Aggregate p95 over 1 second, over 1 request/second, 10 minutes | CPU/memory, input mix, database/Redis and per-route histograms                                    |

`promtool` tests verify holds, recovery, missing targets, high-error/latency
traffic and low-volume suppression. Lack of a scrape target for a _single_
removed replica cannot be detected by `absent` when other replicas remain:
verify target discovery and expected replica counts independently. Monitoring
itself also needs an externally owned heartbeat; a dead Prometheus cannot alert
on itself.

## Safe local load/outage rehearsal

```sh
pnpm operations:rehearsal
```

Docker must be running. The script creates two uniquely named disposable
containers. Pre-pull `postgres:18.6-alpine` and `redis:8.10.1-alpine` on slow
connections; individual Docker operations have a 30-second deadline. The script
binds random loopback ports and starts its own API. It accepts no external
service URLs or existing container IDs. It performs 200 normalization requests
with four closed-loop workers, then pauses and resumes only its own Redis and
PostgreSQL containers. It asserts readiness failure/recovery, continuing
liveness, Redis fail-closed HTTP 503, and metrics availability. Cleanup
unpauses, closes the API and removes its containers, including anonymous test
data volumes. No developer `.env` files, databases, or containers are used.

The fixture is synthetic: 100 repetitions of `က😀` (200 code points), authored
for this exercise and containing no user or sourced corpus material. Results
print only counts, timings, versions and status—not credentials or text.
SIGINT/SIGTERM request cleanup; SIGKILL/host crashes cannot run cleanup. In that
case inspect `docker ps -a` for the exact `myanlex-rehearsal-*` targets before
manually unpausing/stopping them. Never bulk-stop unrelated containers.

This small bootstrap-key test disables quotas and does not measure persisted
tenant usage, billing, OAuth, or all linguistic routes. PostgreSQL coverage here
is readiness connectivity, not database-backed request rejection. Database and
quota correctness remain covered by integration tests. Timing output is a local
diagnostic, **not** production capacity evidence or an SLA gate.

## Explicitly authorized staging load

Use a disposable staging organization/project/key with `text.normalize`
permission. Ensure at least 200 requests and 40,000 characters of quota and a
short-window allowance sufficient for the run. Do not change production limits.
Set the following privately in your environment:

```dotenv
MYANLEX_STAGING_ACK=I own this staging target
MYANLEX_STAGING_URL=https://your-staging-api.example
MYANLEX_STAGING_API_KEY=your-disposable-staging-key
```

Then run `pnpm staging:load`. It sends at most 200 requests with four workers,
rejects redirects, imposes five-second request deadlines, and stops dispatching
after any unexpected result (including 429). Requests already in flight finish.
This consumes real staging quota/usage. Revoke the disposable key afterward. No
remote staging run is performed automatically by CI or during development.

For broader testing, schedule an approved window and record revision, machine
resources, replica count, network location, input sizes/routes, rate/quotas,
latency percentiles, error ratios and recovery times. Include batch workloads,
persisted keys, distributed limits, concurrency ramps, sustained load, and
graceful shutdown. Agree acceptance thresholds **before** the run.

For real staging outages, obtain approval for exact dependency targets and a
rollback owner; the local script intentionally cannot pause remote services.
Verify readiness, traffic removal, liveness, 503 behavior, recovery, and actual
alert firing/resolution. The default two-minute alert hold exceeds this short
local rehearsal, so rehearsal success does not verify alert delivery.

References:
[Prometheus alerting](https://prometheus.io/docs/alerting/latest/overview/) and
[rule testing](https://prometheus.io/docs/prometheus/latest/configuration/unit_testing_rules/).
