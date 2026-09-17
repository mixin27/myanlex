# ADR 0005: Start with in-memory API-key rate limits

## Status

Accepted

## Context

The initial API needs abuse protection before the developer-platform database
and usage system exist. The project plan explicitly requires measuring the
service before adding Redis. The current deployment phase is a single API
process with one configured bearer key.

## Decision

Authenticated routes use a fixed-window request allowance keyed by a SHA-256
digest of the bearer identity. Public health checks are excluded. Configuration
defines the maximum requests and window duration, with defaults of 60 requests
per 60 seconds.

Buckets are stored in process memory. No raw API key is retained by the limiter,
and a rejected request returns HTTP 429 with `Retry-After` and rate-limit
headers.

## Consequences

- The implementation has no external cache dependency and is deterministic in
  unit and end-to-end tests.
- Restarting the process resets allowances.
- Multiple API instances would each enforce an independent allowance. Before
  horizontal scaling, storage must be replaced with a shared implementation or
  rate limiting must be delegated to a trusted gateway.
- Request limiting is separate from future billable usage and quota tracking.
