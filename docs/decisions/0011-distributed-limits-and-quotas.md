# ADR 0011: Distributed rate limits and durable organization quotas

Status: accepted.

## Decision

Use Redis only for shared short-window admission counters. A Lua operation
atomically reads, increments, and expires a per-caller counter; rejection does
not increment it or extend expiry. Use the official `redis` Node client, with
offline queuing disabled, bounded command timeouts/queue size, automatic
reconnection, and shutdown cleanup. Configured Redis unavailability returns 503
without a per-process fallback. In-memory mode remains for single-instance
development. This supersedes ADR 0005's scaling limitation.

Use PostgreSQL for monthly quotas, not Redis and not best-effort usage events. A
unique organization/UTC-month ledger and guarded atomic update reserve both
request and code-point dimensions together. All projects/keys share the same
ledger. No submitted text or credentials are stored there. Plan and subscription
records remain the authority; application and core packages have no dependency
on quota, Redis, authentication, or persistence infrastructure.

Quota enforcement is opt-in as approved for initial rollout. Use an applicable
active subscription or the existing seeded Free plan. Fail closed on ambiguous
or invalid configuration. See [the operational contract](../limits.md) for exact
counting, interval, failure, and rollout semantics.

## Consequences

- Multi-instance API deployments require a shared Redis service with consistent
  configuration. Redis is not introduced as an unmeasured NLP result cache.
- Monthly quotas add a database transaction per admitted persisted-key request
  and serialize updates within an organization/month. Measure this before adding
  quota caching or reservation batching; correctness comes first.
- No distributed transaction couples Redis and PostgreSQL. Burst allowance is
  consumed first; a quota denial/database failure can still spend burst
  capacity.
- Durable admission reservations are intentionally different from completed
  usage reports and financial billing. No refunds, historical backfill, paid
  plan management, quota dashboard, or subscription provisioning are added here.
- Revocation/RBAC continue to read PostgreSQL directly; caching authorization
  could otherwise delay security changes and is not part of this decision.

## References

- [Official Node Redis client](https://redis.io/docs/latest/develop/clients/nodejs/)
- [Redis production guidance](https://redis.io/docs/latest/develop/clients/nodejs/produsage/)
- [Atomic Lua execution](https://redis.io/docs/latest/develop/programmability/eval-intro/)
