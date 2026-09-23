# ADR 0013: Thin TypeScript HTTP SDK

Status: accepted.

Add `@myanlex/sdk` as a typed ESM wrapper around the existing HTTP contract. Use
native fetch with injectable transport, explicit versioned base URL, server-side
API-key authentication, a bounded deadline, caller cancellation, and typed
HTTP/transport errors. Do not add an HTTP client dependency, hidden linguistic
transformations, session management, automatic retries, or caching. The SDK
depends only on domain types; request/batch HTTP envelopes are checked against
routes and exercised against the actual Nest adapter in the smoke test.

Preserve all response text, item ordering, diagnostic codes, and code-point
offsets. Batch item failures remain data, not HTTP exceptions. Unknown problem
codes remain strings. The SDK checks JSON envelopes but does not duplicate all
server validation or promise full runtime validation of response fields.

Quota admission can precede errors/disconnects, so retries remain caller-owned.
HTTPS is required outside loopback, redirects are disabled, cookies are omitted,
and errors do not automatically expose raw bodies or credentials. Long-lived
keys are server-only. An injected transport must honor abort/redirect/credential
options.

Release publication, Dart SDK, portal/session clients, and subscription APIs are
separate milestones. No package is published by this change.
