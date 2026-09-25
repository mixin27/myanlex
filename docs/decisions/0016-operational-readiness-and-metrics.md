# 0016: Operational readiness and private metrics

Status: accepted

Keep public liveness independent of dependencies. Add a readiness contract that
checks configured dependencies only, returns no infrastructure details,
coalesces concurrent calls and caches results briefly. Probe IO must have
adapter-level timeouts; a detached Promise timeout alone cannot prevent resource
accumulation. PostgreSQL uses a bounded dedicated pool; Redis reuses the actual
limiter client. Readiness does not prove schema or business-operation
availability.

Expose Prometheus metrics only when a separate operator token is configured. Use
an application-local registry, route templates and finite method/status labels;
never tenant identifiers or request content. Exclude operational probes from
request measurements. Separate exporters so a broken log sink does not disable
metrics or fail requests. Keep these concerns in the API application, outside
the linguistic core and SDK contracts.

The operator is responsible for private ingress, TLS, scraping every replica,
retention and alerts. See [operational setup](../operations.md).
