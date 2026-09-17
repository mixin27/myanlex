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
    errors/                    Shared HTTP error mapping
    rate-limit/                API-key request allowance
    runtime/                   Runtime configuration providers
    validation/                Shared request-validation primitives
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

`apps/api/.env` supports `MYANLEX_API_KEY`, `PORT`, `MYANLEX_VERSION`,
`MYANLEX_RATE_LIMIT_MAX`, and `MYANLEX_RATE_LIMIT_WINDOW_MS`. Values supplied by
the shell or deployment environment take precedence over the file. The real
`.env` file is ignored by Git; only `.env.example` is committed.

Authenticated routes default to 60 requests per 60-second fixed window for each
API key. Health checks are excluded. The limiter is intentionally in-memory for
the current single-instance phase; a horizontally scaled deployment requires a
shared storage implementation before it can enforce a global allowance.

Batch syllabification and transliteration preserve request order and isolate
text-validation failures to individual items. A batch accepts at most 1,000
items and 1,000,000 UTF-8 bytes of combined text. Fastify rejects HTTP bodies
larger than 1 MiB.

Nest CLI generators can be run from this directory. For example:

```sh
pnpm exec nest generate module modules/example
```

The Nest 12 CLI and schematics require the Node.js versions declared by the root
package. The API runtime itself has a lower floor, but repository development
includes generators, so the stricter toolchain requirement applies.
