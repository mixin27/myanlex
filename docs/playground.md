# Playground implementation and operations

The public `/playground` page defaults to the browser engine. Loading the page
requires the site; already-loaded processing does not require the API. There is
no service worker, offline reload guarantee, automatic fallback, text analytics,
automatic browser storage, or automatic server history.

API runs use a verified account session and a selected project. Current
membership, project ownership, `project.read` and `api.invoke` are checked
before account burst admission and organization quota reservation. Quotas remain
opt-in through the existing `QUOTAS_ENABLED` setting. A batch reserves one
request, counting all nested text code points. Admission is not refunded and
requests are not implicitly retried. Reporting is best-effort, not the quota
ledger. Usage reports distinguish API-key and playground sources.

## Database and build configuration

Apply `pnpm db:deploy` to install migration `20260927000000_playground`. It
backfills existing usage as `api_key`, allows a null API-key reference only for
playground usage, and creates the private saved-run table. Generate the client
with `pnpm db:generate`. Do not run development migrations against production.

Workspace builds generate a common engine identity from the source revision. For
builds without Git metadata, set `MYANLEX_BUILD_ID` to the deployed revision;
Docker builds accept `--build-arg MYANLEX_BUILD_ID=<revision>`. `development` is
an explicit non-release identity, not a package-version substitute.

## Saved artifacts

Saving is explicit and uploads the request and result, including local output.
These are user-submitted artifacts, not server-attested evidence. Reopening
never executes them. Re-running creates a separate in-memory result.

The database clock sets expiry 30 days after creation. Only the creator with
current project membership and `project.read` can read, rename or delete; saving
also requires `api.invoke`. Expired rows are inaccessible. Save limits are 50
unexpired artifacts per user across projects and 1 MiB for the entire request.
Per-user row locks serialize concurrent saves. A client UUID makes identical
retries safe; conflicting reuse returns 409.

Snapshots use serialized JSON in a text column to preserve NUL and malformed
Unicode in recorded error requests; PostgreSQL JSONB cannot represent these
artifacts losslessly. Result shapes are strictly validated before saving or
opening. Titles must be well-formed text without NUL characters.

The API performs bounded hourly cleanup (500 expired rows per pass), with
overlap protection and database `SKIP LOCKED` for concurrent instances. Manual
cleanup removes at most 5,000 rows per invocation:

```sh
DATABASE_URL='<database connection>' pnpm playground:cleanup
```

Deletion removes primary-database payloads. Backup copies remain subject to the
operator's backup-retention policy. No public links or team sharing exist.

## Scope and verification

With Docker running, `pnpm playground:verify` creates isolated PostgreSQL and
Redis containers, applies migrations/seeds and runs `pnpm check` with both
integration-service variables enabled. It removes only its own disposable
containers afterwards. It never uses the developer's application database. It
also applies the new migration over the previous schema with an existing usage
row, checking source backfill and preservation.

`pnpm playground:smoke` builds the production app, checks anonymous access to
the workbench/notices, and executes the compiled worker and comparison in a
worker-shaped VM context. This is not real-browser verification.

Implementation phases 1–6 are present: shared contract/build identity/worker;
public single-operation workbench; session execution/quota/usage; batch and
inspection/reproduction; private saved runs and cleanup; tests, failure recovery
and documentation. Regression evidence includes all nine local/API result
mappings, source validation, malformed Unicode, worker cancellation/deadline/
late events, DOM rendering/IME, tenant authorization, admission ordering,
concurrent key/session quota reservations, concurrent saved-run caps,
idempotency, ownership, pagination, expiry, cleanup and database constraints.

SDK smoke checks exercise all public language routes for TypeScript, Dart and
Python sync/async. Documentation smoke checks exercise examples and rendered
pages. Shell/Python parsers verify hostile-string snippet escaping.

Outstanding release verification: actual browser worker loading and offline
continuation, visual/responsive review, screen-reader review, and browser-native
history/leave-prompt behavior across supported browsers. No computer-use tool
was used. Security/operational launch approval and independent linguistic review
remain separate requirements; nothing was deployed or published.

Conversion uses an explicit source and target, with source validation enabled by
default. No automatic mixed-encoding repair, spelling correction, pipelines,
arbitrary HTTP requests or file migration are included. Detection is evidence,
not a universal quality score; tokenization is not word segmentation.

Results preserve analyzed strings and code-point offsets. Inspection and batch
results paginate at 100 rows. Comparisons over 20,000 combined code points use
side-by-side text rather than detailed diff. Exports do not truncate results;
reproduction bundles omit text/results unless explicitly selected.

Production-grade implementation is not independent linguistic validation or
release approval. Visual layout and browser-specific behavior require separate
review; computer-use verification is intentionally excluded from this task.
