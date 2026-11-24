# 0027 — Self-hosted production on one VPS with Dokploy

Status: accepted (prepared; nothing is deployed yet).

MyanLex now bills real money ([0026](0026-invoices-and-payments.md)), and
billing depends on daily jobs that must run in order: close the month, issue
invoices, send reminders and suspend overdue workspaces. Until now, deployment
covered images and a loopback staging stack
([deployment runbook](../deployment.md)), but left the scheduler, TLS, the image
registry and releases to the operator. There's no budget for production yet, so
this decision prepares everything to go live cheaply when there is.

## Decision

Run the whole stack on **one VPS managed by Dokploy**, the same setup as our
other product, billleaf:

- **Dokploy** deploys `infra/compose.production.yaml` as a Compose app, with
  Traefik and Let's Encrypt for HTTPS. **Cloudflare** is in front for DNS,
  proxying and DDoS protection.
- **Images** are built by GitHub Actions (`.github/workflows/deploy.yml`) and
  pushed to **GHCR** with immutable `<env>-sha-<7>` tags. After approval, the
  workflow moves the `staging` or `production` tag, calls Dokploy's webhook and
  runs `infra/smoke.sh`. The server never builds code.
- **Services:**
  - `migrate` runs once per deploy: `config:check`, then the migrations. The API
    starts only if it succeeds.
  - The API, the console (`web`) and `docs`.
  - `jobs` runs `ops:daily` under supercronic.
  - Postgres and Redis run as containers in the stack.
- **PostgreSQL runs on the host.** It's the cheapest option and has no network
  hop, but the server is then the only copy of the data. So `ops:daily` starts
  with a `pg_dump` to a private **Cloudflare R2** bucket, kept for 14 days, and
  the runbook requires a restore drill before launch.
- **Redis runs on the host** with append-only persistence and `noeviction`. It
  holds rate-limit and quota counters, which must not be evicted silently.
- **Daily jobs** run from one entry point, `pnpm ops:daily`:
  - backup, then close-month, issue-monthly and dunning, then the cleanups;
  - the billing chain stops at its first failure;
  - a Postgres advisory lock stops overlapping runs;
  - a **Healthchecks.io** heartbeat alerts on failed runs and on runs that never
    happen.
- **Production configuration is checked**, not trusted. With
  `MYANLEX_ENV=production`, both the API and `config:check` refuse to start
  without auth, HTTPS, SMTP, quotas, Redis, a metrics token and payment
  instructions, or with the bootstrap API key set. Problems name the variable,
  never its value.
- **Client addresses behind proxies:** `MYANLEX_TRUST_PROXY` lists the proxies
  allowed to set `X-Forwarded-For`, which is the Docker network plus
  Cloudflare's ranges. Without it, every visitor would share Traefik's address
  for rate and auth limits. Hop counts and "trust everything" are refused: they
  let clients pick their own address.

## Cost

About US$5–12 a month for the VPS (4 GB RAM is comfortable). Everything else
fits a free tier:

| What               | Free option                 |
| ------------------ | --------------------------- |
| DNS, proxy and TLS | Cloudflare                  |
| Backups            | Cloudflare R2 (10 GB)       |
| Images             | GHCR                        |
| Job alerts         | Healthchecks.io (20 checks) |
| Email              | Resend (3,000 a month)      |
| Deploy tool        | Dokploy (self-hosted)       |

## Consequences

- One server is a single point of failure. A lost server means restoring the
  latest nightly dump to a new one, so up to a day of writes can be lost; usage
  ledger rows since then are gone too. Accept this for launch. When revenue
  allows, move Postgres to a managed service or a second server with WAL
  archiving for point-in-time recovery.
- We own patching, disk space, Dokploy updates and backups. The runbook lists
  each task.
- Everything is Docker Compose, so the same files run under plain Compose behind
  Caddy if Dokploy is ever dropped.

## Alternatives considered

- **Managed platforms** (Fly.io, Render, Railway) with managed Postgres: less to
  run, but costs grow with usage and cron jobs are extra.
- **Managed Postgres with the app on a VPS:** better recovery, but it costs
  money now. It's the first upgrade once there's revenue.
- **A scheduler inside the API:** no cron to configure, but jobs would share the
  API process and be harder to run by hand.
- **Coolify** instead of Dokploy: equivalent. Dokploy matches billleaf, so we
  operate one tool.
