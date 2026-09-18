# Architecture overview

MyanLex is built from a framework-independent language engine outward.

```text
Applications and APIs
        |
Application services
        |
@myanlex/core
        |
Pure algorithms and domain types
```

The core owns deterministic text-processing behavior. It does not know about
HTTP, NestJS, databases, authentication, logging infrastructure, environment
variables, or deployment concerns.

## Initial packages

- `@myanlex/types` contains stable domain data structures shared at public
  boundaries.
- `@myanlex/core` contains Unicode handling and, as specifications mature,
  detection, normalization, conversion, syllabification, transliteration, and
  tokenization.
- `@myanlex/application` defines framework-independent use cases, input limits,
  and result envelopes. HTTP adapters depend on this package rather than calling
  the core directly.

Feature modules initially remain inside `@myanlex/core`. They should become
independently published packages only when a concrete consumer or versioning
requirement justifies that boundary.

## Application and HTTP boundaries

Application services accept well-formed Unicode strings of at most 100,000 code
points per operation. They do not infer encodings, normalization profiles, or
transliteration schemes. Every operation delegates to one documented core
profile and preserves its result without transport-specific fields.

The public HTTP contract is `openapi/openapi.yaml`. It uses OpenAPI 3.2.1,
versioned `/v1` servers, JSON request bodies, RFC 9457-compatible problem
responses, and bearer API-key authentication except for health checks. The
contract is linted in the normal `pnpm check` path. Controllers and framework
code belong in `apps/` and must implement this contract through
`@myanlex/application`.

`apps/api` is the first adapter. It uses NestJS 12 with the Fastify 5 platform,
Zod request schemas, a bearer API-key guard, and a global RFC 9457
problem-details filter. Its end-to-end tests call Fastify's in-memory injection
API and cover every operation declared in the initial OpenAPI contract.

The API follows Nest's module-oriented application structure while pnpm remains
the repository workspace manager. `AppModule` is a composition root, each HTTP
capability lives in `apps/api/src/modules/<capability>`, and reusable NestJS
transport concerns live in `apps/api/src/common`. Feature services may depend on
`@myanlex/application`, but neither the controllers nor the services may bypass
that boundary to call `@myanlex/core` directly. External persistence, cache,
queue, and telemetry adapters will live in `apps/api/src/infrastructure` when
they are introduced.

Runtime configuration is resolved inside the API's `RuntimeConfigModule`. Local
development may use `apps/api/.env`; deployment environment variables take
precedence. The API key, HTTP port, service version, and rate-limit policy are
validated at startup and exposed to the rest of the application through explicit
injection tokens rather than direct `process.env` access.

Batch-wide limits are enforced by `@myanlex/application`, so non-HTTP consumers
receive the same protection. Individual text-validation failures are returned in
order without hiding unexpected internal errors. The HTTP adapter also caps the
parsed body at 1 MiB.

Rate limiting currently uses one fixed-window, in-memory bucket per hashed API
key and excludes public health checks. This is deliberately a single-instance
implementation. Before horizontal scaling, the storage must become shared so the
advertised allowance remains global. Initial benchmarks meet the documented
targets without caching, so Redis is not part of the current architecture.

The developer-platform boundary uses PostgreSQL through Prisma adapters in
`apps/api/src/infrastructure`. Platform persistence contains users,
organizations, projects, API keys, usage, plans, subscriptions, roles, and
permissions; it never contains linguistic rules or submitted text. Roles are
organization-owned records and authorization is resolved through
`role_permissions`, not an enum or hard-coded role-name switch. API keys may be
scoped to permission records, and language operations require `api.invoke`.

The checked-in OpenAPI document remains the single HTTP contract. The Nest
adapter serves it as JSON and YAML and renders it through Swagger UI and Scalar.
The Next.js developer portal is a separate application and uses App Router route
groups for its account and portal shells. Control-plane account authentication
is intentionally not inferred from NLP API keys.

## Delivery order

1. Linguistic specifications and corpus schemas.
2. Unicode scanner and centralized character classification.
3. Safe normalization and syllabification.
4. Additional language-engine capabilities.
5. Stable OpenAPI contract and HTTP API.
6. Developer platform and interactive API documentation.
7. SDKs and production hardening.
