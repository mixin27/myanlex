# MyanLex API

This workspace is the NestJS/Fastify transport adapter for MyanLex. pnpm owns
the repository workspace; the Nest CLI configuration in this directory owns only
this application.

## Source structure

```text
src/
  app.module.ts                 Root composition only
  create-api-application.ts    Programmatic application factory
  main.ts                       Production entry point
  common/
    application/               Framework-independent use-case provider
    auth/                      Shared authentication policy
    docs/                      Swagger and Scalar API documentation
    errors/                    Shared HTTP error mapping
    rate-limit/                API-key request allowance
    runtime/                   Runtime configuration providers
    usage/                     Privacy-safe request accounting
    validation/                Shared request-validation primitives
  infrastructure/
    database/                  Prisma/PostgreSQL platform adapter
  modules/
    <capability>/              Controller, service, DTO/schema, and module
```

Feature controllers translate HTTP requests and responses. Feature services
delegate to `@myanlex/application`; they must not call `@myanlex/core` directly.
Cross-cutting NestJS concerns belong in `common/`, while future database, cache,
queue, or telemetry adapters belong in `infrastructure/`.

Keep `AppModule` limited to composition. New public capabilities should be
generated or created as feature modules under `src/modules/` and must also be
represented in the OpenAPI contract and end-to-end tests.

## Development

Create the local environment file, then build the framework-independent
workspace packages before starting the API in watch mode:

```sh
cp apps/api/.env.example apps/api/.env
pnpm --filter @myanlex/types build
pnpm --filter @myanlex/core build
pnpm --filter @myanlex/application build
pnpm --filter @myanlex/api start:dev
```

`apps/api/.env` supports `DATABASE_URL`, `MYANLEX_API_KEY`, `PORT`,
`MYANLEX_VERSION`, `MYANLEX_RATE_LIMIT_MAX`, and `MYANLEX_RATE_LIMIT_WINDOW_MS`.
Values supplied by the shell or deployment environment take precedence over the
file. The real `.env` file is ignored by Git; only `.env.example` is committed.

Authenticated routes default to 60 requests per 60-second fixed window for each
API key. Health checks are excluded. The limiter is intentionally in-memory for
the current single-instance phase; a horizontally scaled deployment requires a
shared storage implementation before it can enforce a global allowance.

Batch syllabification and transliteration preserve request order and isolate
text-validation failures to individual items. A batch accepts at most 1,000
items and 1,000,000 UTF-8 bytes of combined text. Fastify rejects HTTP bodies
larger than 1 MiB.

The checked-in OpenAPI contract is served at `/openapi.json` and
`/openapi.yaml`. Swagger UI is available at `/swagger`; the preferred Scalar
interface for testing requests is available at `/docs`. Both UIs render the same
authoritative contract rather than generating another contract from controller
decorators.

## Developer platform database

Start the local PostgreSQL service, apply the migration, and seed global
permissions plus the free plan:

```sh
docker compose up -d postgres
pnpm db:deploy
pnpm db:seed
```

Roles are organization-owned database records. Permissions and role-permission
assignments are data, not TypeScript or PostgreSQL enums. Persisted API keys
store only a SHA-256 hash and display prefix; request usage stores endpoint,
status, character count, and processing time, never submitted text. The
configured `MYANLEX_API_KEY` remains a non-persisted bootstrap key for local
development and migrations to database-managed keys.

Nest CLI generators can be run from this directory. For example:

```sh
pnpm exec nest generate module modules/example
```

The Nest 12 CLI and schematics require the Node.js versions declared by the root
package. The API runtime itself has a lower floor, but repository development
includes generators, so the stricter toolchain requirement applies.
