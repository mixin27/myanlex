# 0020: Consumer artifacts and explicit registry releases

Status: implemented release preparation; publication is not approved.

Keep the monorepo. npm distributes types, core, application and the HTTP SDK as
individual packages. The first three share a fixed release group because their
contracts and linguistic profiles evolve together. The HTTP SDK can evolve
independently, including dependency bumps when its shared types change.
Changesets records JavaScript release intent and dependency updates.
Dart/pub.dev and Python/PyPI remain independently versioned, with separate
native release tools.

Do not publish the workspace root, API, web, docs or private playground package.
Registry/package ownership must be verified before any release; GitHub ownership
does not establish ownership of the npm scope, pub.dev name or PyPI project.

Use native pnpm packing to resolve workspace/catalog references. Fresh staging
compilation excludes stale dist files, tests and source maps. The package-set
manifest records exact archive hashes, source commit, dirty state and toolchain.
Dirty artifacts are development snapshots and not attributable to the commit
alone. The manifest is build evidence, not a cryptographically attested
provenance statement.

Compatibility tests install only archives in a temporary directory using an
empty npm cache and offline installation. They test ESM, NodeNext/Bundler
declarations, all nine operations, guarded errors, limits, partial batches, SDK
network failure, and a real browser worker after network access is disabled. No
engine code moves into transport or release tooling. No linguistic algorithms or
behavior change.

Local packages process without infrastructure. HTTP SDKs do not embed the engine
or silently fall back. Offline website reload, native Python/Dart processing,
CommonJS output, and universal runtime/Unicode conformance are not promised.

Publication, prerelease version selection, registry credentials, automatic OIDC
publishing, release tags and downstream artifact updates require separate
approval. See [the release runbook](../publishing.md).
