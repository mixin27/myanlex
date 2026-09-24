# Developer documentation

The dedicated site is in `apps/docs`, scaffolded with the official Fumadocs CLI.
It uses Next.js, Fumadocs MDX, Tailwind CSS v4, highlighted/copyable code
blocks, language tabs, steps, search, a TOC and theme switching. Its OpenAPI
reference is generated directly from `openapi/openapi.yaml`; there is no second
schema.

```sh
pnpm --filter @myanlex/docs dev
```

Open http://localhost:3002. The console's Documentation page links here and its
old `/docs` route redirects here. Set `NEXT_PUBLIC_DOCS_URL` in the web app and
`NEXT_PUBLIC_CONSOLE_URL` in the docs app for deployment, then rebuild.

## Audience separation

- Public API consumers: quick start, authentication, language guides, batching,
  errors, SDKs and reference. No platform checkout is assumed.
- Self-hosting operators: database, mail, environment, limits and deployment.
- Contributors: architecture, specifications, corpus provenance and test
  workflow.

Public MDX lives in `apps/docs/content/docs`. It is trusted source code, never
user-submitted content. No API proxy, key entry or account sessions are added to
the docs site. Execute requests in deployment-local Scalar instead.

## Preview notice and release

`apps/docs/src/lib/shared.ts` owns `developerPreview` and the notice text. The
banner appears site-wide; temporary SDK alternatives use `PreviewOnly`. Planned
registry commands are visibly marked unavailable by those notices. Before
disabling the flag, verify package ownership/names and versions, API and console
URLs, and installation examples. Removing notices does not publish packages or
deploy the API.

## Verification

`pnpm docs:smoke` builds an ephemeral API and checks all nine example request
bodies plus runnable curl, JavaScript, Python and TypeScript examples, including
invalid credentials. Test cases live in `examples/http/contract-cases.ts`.
`pnpm dart:sdk:smoke` covers the Dart SDK separately.

The docs app tests content navigation and internal links; its production HTTP
smoke verifies generated pages, search and the downloadable OpenAPI document
without computer use. `pnpm check` includes docs linting, types and tests.
