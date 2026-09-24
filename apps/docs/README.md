# MyanLex documentation site

Dedicated Next.js + Fumadocs MDX app, created with the official
create-fumadocs-app CLI. Public documentation does not require account sessions.

From the repository root:

```sh
pnpm install
pnpm --filter @myanlex/docs dev
pnpm --filter @myanlex/docs build
pnpm --filter @myanlex/docs start
```

Local URL: http://localhost:3002. Search uses the built-in Fumadocs search
endpoint; syntax highlighting, code copying, tabs, steps, breadcrumbs, theme
switching and TOC use Fumadocs components. No browser automation is required.

Set NEXT_PUBLIC_CONSOLE_URL to the portal origin when deploying. Rebuild after
changing public configuration. No database, API credentials or auth secrets
belong in this app. MDX is trusted repository code: do not compile
user-submitted content. Deploy this Next.js application with the monorepo root
available at build time (the API reference reads ../../openapi/openapi.yaml).

The global preview flag and message live in src/lib/shared.ts. At launch, verify
package ownership/names, versions, console/API URLs and all installation
examples before setting developerPreview to false. SDK pages keep a working
preview alternative inside a reusable component.

Content is authored under content/docs. API-user guides must not assume a
repository checkout. Keep setup details in self-hosting and contributing. The
API schema remains authoritative; do not maintain a second schema here.
