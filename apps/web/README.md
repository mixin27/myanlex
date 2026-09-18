# MyanLex developer portal

This Next.js application is the dashboard foundation for developer accounts,
organizations, projects, API keys, usage, and documentation. It was generated
with the current stable `create-next-app` App Router template and participates
in the repository's root pnpm workspace.

## Structure

Routes live in `src/app`. Route groups separate the unauthenticated account
shell from the signed-in portal shell without changing public URLs:

```text
src/app/
  (auth)/login/
  (portal)/
    account/
    api-keys/
    dashboard/
    documentation/
    projects/
    usage/
```

Pages remain server components unless browser state or event handlers require a
narrow client boundary. Account authentication and control-plane mutations are
not implemented yet; API bearer keys are intentionally not used as portal
sessions.

## UI system

The portal uses Tailwind CSS v4 and shadcn/ui's `base-nova` configuration.
Component source is deliberately checked into `src/components/ui`, so it is
reviewable and can be adapted to MyanLex rather than treated as a black-box
dependency. `src/components/data-table.tsx` is the shared typed TanStack Table
foundation; add only the table features that a screen needs.

Add new primitives from this workspace with:

```sh
pnpm dlx shadcn@latest add <component> -c apps/web
```

The root layout already mounts Sonner and the tooltip provider.

## Development

From the repository root:

```sh
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @myanlex/web dev
```

The portal defaults to port 3000. Run the API on another local port when both
applications are active, then set `NEXT_PUBLIC_API_DOCS_URL` to its Scalar URL.
