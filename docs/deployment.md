# Deployment packaging and staging runbook

Status: packaging for controlled staging, not approval for production launch.
See [RC1 gates](quality/rc1-checklist.md). Nothing here deploys remotely or
changes the existing development Compose project.

## Images and boundaries

The root Dockerfile provides `api`, `web`, `docs`, and `migrate` targets.
Runtime containers use the unprivileged Node user. The API contains production
package dependencies, compiled application code and OpenAPI; the separate
migration image includes development tooling needed by Prisma/seed. Do not
expose or run the migration image as a service. Images never contain local
`.env` or `local/` files; `.dockerignore` also excludes dependency/build caches
and credential files. Do not place secrets elsewhere in the repository or pass
them as build args.

Node matches the repository (24.21.0); pnpm stays at 10.18.3. Record resolved
image digests, architecture and candidate Git revision in release evidence.
`--frozen-lockfile` prevents dependency re-resolution; tags alone are not an
immutable supply-chain guarantee. Scan all final images before approval.

Workspace dependencies are injected and synchronized after `build`, following
[pnpm's monorepo Docker guidance](https://pnpm.io/10.x/docker), so `pnpm deploy`
can derive an isolated production package from the checked-in lockfile. After
pulling this change, run `pnpm install --frozen-lockfile` and rebuild workspace
dependencies before starting the API. Build changes are synchronized; source
watching alone does not rebuild a dependency's compiled output.

Next.js uses standalone output with the monorepo tracing root. Static/public
assets are copied explicitly. Public URLs and portal rewrites are build-time
configuration: rebuild for a different public origin or internal API hostname.
Runtime `API_INTERNAL_URL` must match the baked rewrite destination. Never put
API keys, OAuth secrets or database URLs in `NEXT_PUBLIC_*` variables.

## Controlled staging

Provision dedicated PostgreSQL 18 and Redis instances reachable from containers.
Do not point this exercise at your development or production database. Redis is
required for shared limits across replicas. Database/Redis are not published or
created by `compose.staging.yaml`; use private networking, TLS where
appropriate, strong authentication, persistent storage and a least-privilege
application role. Use a separate database role for migrations where your
infrastructure supports it.

Create a private API environment file outside the repository (mode 0600).
Supply:

```dotenv
DATABASE_URL=postgresql://APPLICATION_USER:PASSWORD@PRIVATE_DB:5432/myanlex_staging
REDIS_URL=redis://PRIVATE_REDIS:6379
AUTH_ENABLED=true
AUTH_SECRET=REPLACE_WITH_AT_LEAST_32_RANDOM_CHARACTERS
AUTH_PUBLIC_URL=https://console.staging.example
SMTP_HOST=YOUR_SMTP_HOST
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FROM=auth@YOUR_DOMAIN
SMTP_USER=YOUR_SMTP_USER
SMTP_PASSWORD=YOUR_SMTP_PASSWORD
MYANLEX_QUOTAS_ENABLED=false
MYANLEX_REDIS_PREFIX=myanlex-staging
MYANLEX_METRICS_TOKEN=REPLACE_WITH_A_SEPARATE_RANDOM_OPERATOR_TOKEN
```

These are placeholders, not usable credentials. Add Google/GitHub credential
pairs only when configured; verify callbacks against the public console origin.
Prefer persisted scoped API keys; omit the global bootstrap `MYANLEX_API_KEY`.
Keep quotas opt-in until migrations, plan seeding and expected allowance are
verified. API readiness proves connectivity, not migration completion.

Set these nonsecret orchestration variables in your shell:

```sh
export MYANLEX_IMAGE_TAG=YOUR_CANDIDATE_COMMIT
export MYANLEX_STAGING_ENV_FILE=/absolute/private/path/api.env
export MYANLEX_CONSOLE_ORIGIN=https://console.staging.example
export MYANLEX_API_ORIGIN=https://api.staging.example
export MYANLEX_DOCS_ORIGIN=https://docs.staging.example
docker compose -f compose.staging.yaml config --quiet
docker compose -f compose.staging.yaml --profile operations build
```

Do not print plain `docker compose config` or attach container inspections to
public issues: resolved environment values can expose secrets. Local env-file
injection is an operator example, not a replacement for your secret manager.

After confirming the exact target and taking a verified backup:

```sh
docker compose -f compose.staging.yaml --profile operations run --rm migrate
# First provisioning only; review subsequent seed changes before rerunning.
docker compose -f compose.staging.yaml --profile operations run --rm migrate pnpm db:seed
docker compose -f compose.staging.yaml up -d api web docs
docker compose -f compose.staging.yaml ps
```

Migrations run as an explicit one-shot job, never on each API startup. Serialize
release jobs. The seed upserts permissions and resets the Free plan's configured
limits; it is not a harmless read-only check. Do not automatically reseed on
every deployment. API/portal startup must wait for successful migrations.

The services bind only loopback: portal 3100, API 3101, docs 3102. Configure a
trusted TLS reverse proxy before testing production authentication. Keep
`/internal/metrics` private; do not forward it on the public API virtual host.
Apply request-size/time limits and correct forwarded host/protocol handling; do
not enable blanket proxy trust. Verify authentication, secure cookies,
verification email, OAuth and logout through the real HTTPS origin. The local
smoke test intentionally does not send mail or contact OAuth providers.

This is a single-instance staging baseline, not a highly available topology.
Next caches are local; before multiple portal/docs replicas, review shared-cache
coordination, consistent builds/server-action keys and rolling-version handling.
Keep account/platform responses uncached at ingress. Drain traffic before
shutdown; Compose allows 30 seconds but does not itself remove ingress traffic.

## Backup, restoration and rollback

Use an approved PostgreSQL 18 client and private `PGSERVICE`/`PGPASSFILE`
configuration rather than embedding credentials in command lines. Store dumps
encrypted with restricted access and retention; they contain account and tenant
data. A logical dump is not point-in-time recovery or a backup of external
secrets, roles, object storage or Redis state.

```sh
umask 077
# PGSERVICE selects the explicitly approved source in a private service file.
pg_dump --format=custom --no-owner --no-acl --file=/private/backups/candidate.dump
pg_restore --list /private/backups/candidate.dump
```

Verify the dump by restoring into a **new isolated empty database**, never over
the running source. Switch `PGSERVICE` to that approved restore database, then:

```sh
pg_restore --exit-on-error --no-owner --no-acl --dbname=RESTORE_DATABASE /private/backups/candidate.dump
```

Do not add `--clean` or drop an existing database. Compare schema/migration
history, critical table counts, referential integrity and representative tenant
operations. Test with outbound email/OAuth/webhooks disabled. Record duration,
recovery point, owner and evidence; a successful dump/list is not a restoration
test. PostgreSQL globals and managed-service PITR require separate procedures.

Retain previous image digests. Roll back application images only when the new
schema remains backward compatible. Prefer expand/contract migrations; Prisma
does not automatically reverse destructive migrations. Database restoration
requires a separately approved maintenance/recovery plan and can lose writes
after the backup. Redis reset may reset limiter counters; do not clear it during
routine deployment or claim quotas/backups are verified merely by readiness.

## Local image verification

With Docker running, build the test-tagged targets from this repository:

```sh
docker build --target api -t myanlex-api:packaging-test .
docker build --target migrate -t myanlex-migrate:packaging-test .
docker build --target web -t myanlex-web:packaging-test .
docker build --target docs -t myanlex-docs:packaging-test .
pnpm deployment:smoke
```

The smoke script owns uniquely named disposable containers and a network. It
checks runtime non-root users, API readiness/conversion, portal proxy, docs
search/static assets, repeated migrations, baseline seed and PostgreSQL dump /
restore into a second fresh test database. No supplied URLs, credentials,
existing containers or user data are used. Cleanup removes only its containers,
their anonymous volumes and network; image/build caches remain. SIGKILL or a
Docker failure can leave resources named `myanlex-packaging-*`: inspect exact
targets before removing them. This is not a full production backup, tenant
restore, OAuth, TLS or capacity acceptance test.
