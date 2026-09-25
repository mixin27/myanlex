# API hardening and release gates

This is an incremental hardening baseline, not a production-readiness claim. It
does not change linguistic behavior, authentication permissions, or quotas.

## HTTP boundary

- The API generates a UUID for each request and returns `X-Request-ID`.
  Client-supplied request IDs and forwarded client addresses are not trusted.
- JSON responses (including problem responses) use `private, no-store` and a
  restrictive content security policy. Helmet adds security headers, including
  `nosniff` and frame denial; browser camera, microphone and geolocation are
  denied.
- Swagger and Scalar HTML retain script compatibility. Their policy blocks
  framing and objects but is **not** a complete script/XSS policy.
- The body limit remains one mebibyte. A 30-second incoming-request timeout
  bounds body receipt; it is not a handler execution deadline.
- HTTPS termination and HSTS are the deployment edge's responsibility. The API
  does not enable HSTS on localhost or blindly trust proxy headers.

## Privacy-safe operational logs

The default Nest console logger emits JSON. HTTP completion records contain only
`event`, `requestId`, `method`, registered `route` template, `statusCode`, and
`durationMs`. Unmatched routes are labeled `unmatched`. Body, query, raw URL,
cookies, headers, IP addresses, credentials, and path parameter values are
omitted. Aborted body requests use `http_request_aborted` and a null status;
these hooks are not a durable accounting mechanism or guaranteed disconnect
telemetry.

Usage persistence failures emit `usage_persistence_failed`, without raw
exception objects. Better Auth warnings/errors retain severity and a generic
event only; debug/info messages and raw provider/database errors are suppressed.
This trades diagnostic detail for protection against accidental credential and
text exposure. Never enable raw request/error logging in production to
troubleshoot these events. Configure equivalent redaction, retention and access
controls at proxies and log collectors. Application filtering cannot protect
independently collected edge logs.

## Dependency security

Run `pnpm security:audit` before release. CI rejects high/critical production
dependency advisories; audit findings require review, not blind major upgrades.
The September 2026 baseline pins transitive fixes in `pnpm-workspace.yaml`:

- Undici 7.29.1 within major 7, used by the documentation tooling.
- mysql2 3.24.4, an optional Prisma dependency (MyanLex uses PostgreSQL).
- `@prisma/config>deepmerge-ts` 8.0.2 for its recursion exhaustion fix. This is
  a narrowly scoped major override: Prisma uses plain-object config merging, not
  the changed Map/type/deepmergeInto interfaces. Revalidate Prisma generation,
  migrations, and seeding when changing it. Remove the override when upstream
  adopts a patched version.

An empty audit reports only known advisories, not proof of security.

## Remaining production release gates

- Dependency-aware readiness separate from the public liveness contract.
- Bounded-cardinality metrics, monitoring, alerting and log retention policy.
- Staging load tests, graceful shutdown and dependency outage exercises.
- TLS/HSTS, explicit proxy trust topology, backups and tested restoration.
- Real SMTP and Google/GitHub OAuth deployment verification and secret rotation.
- Independent linguistic/corpus review and documented beta limitations.
- Browser-level dashboard/docs security and accessibility verification.

Do not remove developer-preview warnings solely because this baseline passes.
