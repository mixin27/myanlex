# MyanLex

[![CI](https://github.com/mixin27/myanlex/actions/workflows/ci.yml/badge.svg)](https://github.com/mixin27/myanlex/actions/workflows/ci.yml)

MyanLex is an open-source, developer-focused toolkit for processing
Myanmar-language text.

The project is being built from the language engine outward: a deterministic,
framework-independent core first, followed by stable APIs and SDKs. Linguistic
correctness and a reviewed regression corpus take priority over implementation
convenience.

## Status

MyanLex is in early development. The current milestones establish Unicode
code-point handling, deterministic character classification, safe Unicode
normalization, Burmese orthographic syllabification, linguistic specifications,
structural orthography validation, corpus formats, and the core package
boundary. It also provides conservative standard Unicode and Zawgyi detection
and explicit conversion in both directions, plus source-preserving ALA-LC 2011
Myanmar-to-Latin transliteration and lossless Myanmar-aware tokenization with
mixed-script reporting. A framework-independent application-service boundary and
linted OpenAPI 3.2.1 contract now expose those capabilities for future HTTP
adapters. The first adapter is a NestJS 12 and Fastify 5 API with bearer-key
authentication, rate limiting, strict request validation, batch processing, and
RFC 9457 problem responses. The developer-platform foundation now adds a
PostgreSQL/Prisma schema, dynamic roles and permissions, hashed project API
keys, privacy-safe usage records, Swagger and Scalar documentation, and a
Next.js developer portal shell.

Do not use the API or package interfaces as stable production contracts yet.

For controlled self-hosted staging, see the
[deployment runbook](docs/deployment.md).

NLP quality validation and RC1 preparation are documented in
[the quality workflow](docs/quality/README.md). Run `pnpm quality:report` to
generate corpus results and the independent-review queue. Passing regression
tests is not a measured linguistic accuracy score or release approval.

## Capabilities

- Myanmar Unicode and Zawgyi detection
- Explicit Unicode and Zawgyi conversion
- ALA-LC 2011 Myanmar-to-Latin transliteration
- Unicode normalization
- Myanmar syllabification
- Structural Burmese orthography validation
- Myanmar-aware tokenization and Myanmar/Latin mixed-script reporting
- Framework-independent application services with Unicode input limits
- Ordered syllabification and transliteration batches with per-item failures
- OpenAPI 3.2.1 contract for nine text-processing operations and health
- NestJS/Fastify HTTP adapter with authentication, rate limiting, and request
  validation
- Repeatable application and in-memory HTTP performance benchmarks
- Dynamic database-backed RBAC and scoped project API-key foundations
- Swagger UI and Scalar over the authoritative OpenAPI contract
- Next.js portal routes for login, dashboard, projects, keys, usage, team, docs,
  and account

- Self-hosted email/password sessions and optional Google/GitHub OAuth;
  [setup and verification](docs/authentication.md)
- Session-protected organization onboarding and project management with dynamic
  permissions; [workflow and Scalar testing](docs/platform.md)
- Scoped project API-key issuance and revocation, best-effort usage reports and
  monthly quota reporting
- Billing-grade usage metering: an append-only ledger written with each quota
  reservation, immutable monthly statements and a CSV export;
  [statements](docs/platform.md#monthly-statements)
- Team management: member roles, custom roles with permission editing, and email
  invitations with an in-portal pending list;
  [team workflow](docs/platform.md#team-management)
- Administrative audit log of every platform change, with retention cleanup, and
  confirmed ownership transfer;
  [audit log](docs/platform.md#audit-log-and-ownership-transfer)
- TypeScript, Dart and Python HTTP SDKs versioned as 0.1.0 betas; see
  [publishing](docs/publishing.md)

Planned next:

- Plans, prices and billing on top of monthly statements

## Repository layout

```text
packages/
  core/              Framework-independent language engine
  application/       Framework-independent use cases and input policy
  types/             Shared public domain types
  sdk/               Typed native-fetch HTTP client
  myanlex_dart/       Pure Dart HTTP SDK (official package scaffold)
  myanlex_python/     Typed synchronous/asynchronous Python HTTP SDK
apps/
  api/               NestJS/Fastify HTTP adapter
  web/               Next.js developer portal
prisma/              Platform schema, migrations, and seed data
corpus/              Reviewed linguistic regression data
docs/
  architecture/      System and package boundaries
  linguistic/        Authoritative linguistic specifications
  decisions/         Architecture decision records
  performance/       Reproducible benchmark baselines and targets
openapi/              Authoritative HTTP API contract
```

Planning drafts are retained under `local/` for reference. They are not
authoritative specifications.

## Requirements

- Node.js 24.21.0 (recommended via `.nvmrc`; compatible ranges are declared in
  `package.json`)
- pnpm 10.18.3 or a compatible pnpm 10 release

Enable Corepack if pnpm is not already available:

```sh
corepack enable
corepack prepare pnpm@10.18.3 --activate
```

## Development

```sh
pnpm install
pnpm check
```

Useful commands:

```sh
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
pnpm benchmark
pnpm db:generate
pnpm db:deploy
pnpm db:seed
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Changes to
linguistic behavior must update the specification, corpus, tests, and
implementation together.

## Local API

Create an app-local environment file, then build and start the versioned HTTP
API:

```sh
cp apps/api/.env.example apps/api/.env
pnpm build
pnpm --filter @myanlex/api start:prod
```

Deployment environment variables override values loaded from the local file.

The unauthenticated health endpoint is `GET http://localhost:3000/v1/health`.
For dependency readiness, use `/v1/health/ready`. Optional operator-protected
Prometheus metrics are documented in the [operations guide](docs/operations.md).
All language operations require `Authorization: Bearer <key>` and follow
[`openapi/openapi.yaml`](openapi/openapi.yaml).

Interactive API documentation is served by the Nest application at
`http://localhost:3000/docs` (Scalar) and `http://localhost:3000/swagger`.

For multi-instance deployments, configure Redis-backed rate limiting. Usage
metering always uses PostgreSQL; enforcing monthly organization quotas is
opt-in. See the [limits setup guide](docs/limits.md) before enabling either
feature.

## Local packages and publishing

`@myanlex/application` and `@myanlex/core` process text locally without an API,
account or network once installed/bundled. HTTP SDKs are separate clients, not
offline engines. Browser consumers should run the local engine in a worker;
offline page loading is the consuming application's responsibility.

Run `pnpm packages:verify` to build archives and test an isolated consumer with
network-disabled browser processing. See
[package distribution and publishing](docs/publishing.md) for setup,
compatibility evidence, Changesets, and the separate npm/pub.dev/PyPI release
procedures. Nothing is published by these preparation commands.

## TypeScript SDK

The workspace includes [`@myanlex/sdk`](packages/sdk/README.md), a thin
native-fetch client for language and batch operations, with typed errors,
timeouts, and caller cancellation. Keep API keys on your server. The package is
not yet published; run `pnpm sdk:smoke` to verify it against a local ephemeral
Nest API.

## Dart SDK

[`myanlex_dart`](packages/myanlex_dart/README.md) provides typed language and
batch methods, cancellation, deadlines, and quota-aware errors. Created with the
official Dart CLI package template; currently available as a local path
dependency only. Run `pnpm dart:sdk:smoke` for real API contract verification.
Keep keys server-side.

## Developer guide

Run `pnpm --filter @myanlex/docs dev` and open http://localhost:3002 for the
dedicated MDX documentation site. Dashboard → Documentation links to it.
API-consumer guides are separate from self-hosting and contributor instructions.
See the [repository guide](docs/developer-guide.md) for configuration and
verification. `pnpm docs:smoke` checks API examples; `pnpm docs:site:smoke`
checks the production documentation site without browser automation. See
[release status](CHANGELOG.md) for what is available and what remains.

## License

MyanLex source code is available under the [MIT License](LICENSE). Corpus
contributions must have clear provenance and compatible redistribution terms.
