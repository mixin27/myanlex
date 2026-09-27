# 0019: Explicit local/API workbench and private saved artifacts

Status: accepted implementation direction

The public workbench defaults to a dedicated worker calling application
services. The framework-independent playground package owns the closed dispatch
catalog, typed requests/results and reproduction tools, not linguistic
algorithms. Browser and API adapters share a source-revision build identity.
Parity is only claimed for the same engine build and options.

Execution mode is explicit. No fallback uploads text. Local processing has no
API metering, analytics upload or automatic persistence. An already-loaded
engine may work without API availability; offline page reload is not promised.

API executions use current session/membership/project permissions, account burst
limits, then project-based organization quota reservation. They never fabricate
API-key principals. Usage source is additive and constrained in the database;
reporting remains separate from the enforcement ledger.

Saved snapshots require explicit upload consent, are private creator artifacts,
expire after 30 days and are not attested server results. Current project access
is rechecked. User-row locks serialize the cross-project cap; client identifiers
make retries idempotent. Reading a snapshot never executes it. Backup retention
is operator-controlled and independent of primary-database deletion.

See [operations and limits](../playground.md). Deployment, publication and
linguistic release approval are separate decisions.
