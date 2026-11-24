# Production go-live checklist

Status: **not live**. This checklist sits alongside the
[RC1 gates](quality/rc1-checklist.md); those cover linguistic quality and
release approval, while this one covers running the service. Setup steps are in
the [Dokploy runbook](dokploy-runbook.md), and the reasoning is in
[0027](decisions/0027-self-hosted-dokploy.md).

## Prepared in the repository (no server needed)

- [x] Production stack: `infra/compose.production.yaml`, the env template, and
      Postgres and Redis on the host with persistent volumes.
- [x] One-off `migrate` job that runs `config:check` before migrations. The API
      waits for it.
- [x] Production configuration rules enforced by the API and by `config:check`.
      Variables are named, never their values.
- [x] Daily run (`ops:daily`): backup, billing chain, cleanups, a lock and a
      heartbeat, scheduled by supercronic in `jobs`.
- [x] Nightly `pg_dump` to an S3-compatible bucket with retention.
- [x] Proxy trust for client addresses (`MYANLEX_TRUST_PROXY`); hop counts and
      "trust everything" are refused.
- [x] Release workflow: GHCR images with immutable tags, a critical CVE scan,
      approval for production, the Dokploy webhook and the smoke check.
- [x] `/v1/health` reports the build, so deploys wait for the new version.
- [x] CI builds the ops image, checks the crontab, `pg_dump`, `config:check`, a
      full `ops:daily` and the stack definition.

## Needs the real server (do before announcing)

- [ ] **Hosting:** VPS hardened (step 1), Dokploy with 2FA, image cleanup on.
- [ ] **TLS:** Cloudflare Full (strict), Always use HTTPS and HSTS. Ports 80 and
      443 open only to Cloudflare.
- [ ] **Client addresses:** Traefik trusts Cloudflare, `MYANLEX_TRUST_PROXY` is
      set, and limits are checked from two networks.
- [ ] **Email:** domain verified (SPF, DKIM, DMARC). A verification email,
      password reset, invitation and invoice email are each received.
- [ ] **OAuth** (if offered): Google/GitHub callbacks on the console origin,
      tested end to end.
- [ ] **Seed and plans:** `db:seed` once; paid plans created with
      `billing:plans`; payment instructions show on the Billing page.
- [ ] **Backups:** the first dump is in R2, the lifecycle rule is set, and a
      **restore drill** into a new database is done and timed.
- [ ] **Heartbeat:** Healthchecks receives the first daily run. A deliberate
      failure (for example a stopped `postgres` on staging) produces an alert
      you actually receive.
- [ ] **Monitoring:** decide whether to run the
      [Prometheus stack](staging-validation.md). If not, the heartbeat plus
      Dokploy's container health is the minimum.
- [ ] **First month end watched live:** on the 1st, check that close-month,
      issue-monthly and dunning succeed and the emails go out.
- [ ] **Rollback rehearsed:** deploy the previous `production-sha-…` tag once on
      staging, and confirm it runs on the current schema.
- [ ] **Release approval:** the [RC1 gates](quality/rc1-checklist.md), security
      gates in [hardening](security/hardening.md), and the release owner's
      sign-off.
