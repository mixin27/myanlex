# Package distribution and publishing

This milestone prepares and verifies packages. Nothing is published; 0.0.0 is a
development preview, not a stable release. The HTTP SDKs need a reachable
server; publishing them does not deploy an API. Independent linguistic review
and the existing RC/security/operations release gates remain separate.

## One repository, several registry packages

| Folder                  | Distribution                         | Runtime purpose          | Version policy                                                    |
| ----------------------- | ------------------------------------ | ------------------------ | ----------------------------------------------------------------- |
| packages/types          | npm: @myanlex/types                  | Domain types             | Fixed engine group                                                |
| packages/core           | npm: @myanlex/core                   | Local algorithms         | Fixed engine group                                                |
| packages/application    | npm: @myanlex/application            | Validated local services | Fixed engine group                                                |
| packages/sdk            | npm: @myanlex/sdk                    | TypeScript HTTP client   | Independent; shared-type dependency updates may require a release |
| packages/myanlex_dart   | pub.dev: myanlex_dart                | Dart HTTP client         | Independent Dart versions/changelog                               |
| packages/myanlex_python | PyPI: myanlex-python; import myanlex | Python HTTP client       | Independent Python versions/release notes                         |

These are intended names, not a claim that registry ownership is established.
The root and apps stay private; @myanlex/playground is internal and not
distributed. Domain/API contract versions, engine profile IDs, package versions
and deployment revisions are different identifiers. Do not infer compatibility
from equal numbers.

Compared with Dart: each npm package.json plays a role similar to pubspec.yaml.
You publish a package folder, not the Git repository. pnpm coordinates local
development and packing; Changesets coordinates JavaScript version changes and
changelogs. Dart and Python keep their own tools; they need not release whenever
the engine or portal changes.

After registry publication, a JavaScript consumer will install only what it
needs, without cloning this repository:

```sh
# Future registry installation; packages are not published yet.
pnpm add @myanlex/application  # local processing; brings core/types transitively
pnpm add @myanlex/sdk          # HTTP client; does not embed the local engine
```

The npm registry is to JavaScript what pub.dev is to Dart. Consumers may use
npm, pnpm or Yarn regardless of our repository's package manager. Internal
`workspace:*` references exist only during monorepo development; pnpm packing
replaces them with real versions for consumers.

## Local/offline contract

Once installed/bundled, core and application need no API, network, sign-in,
database, remote model download or quota. Browser work belongs in a worker.
Consumers must provide application assets; offline page reload is not supplied
by these packages. All three HTTP SDKs require a reachable API, including when
pointing to a local self-hosted server. None silently switches to embedded
execution. There is no native Dart/Python offline engine in this release.

JavaScript packages are ESM-only with declarations and ES2022 output. Node
engine ranges follow the workspace policy; CI exercises Node 22.22.3 and
24.21.0. Browser worker jobs exercise Playwright Chromium, Firefox and WebKit on
Linux. A configured job is not evidence it passed: review exact-commit
artifacts. WebKit is not a claim of device Safari/iOS verification. Other
Node/browser versions are not individually certified. Node built-ins must not
enter browser bundles.

Normalization uses native String.normalize. Version-matched engine parity for
the tested fixtures is not exhaustive Unicode/runtime conformance or linguistic
accuracy.

## Prepare artifacts without publishing

```sh
pnpm install --frozen-lockfile
pnpm packages:pack
pnpm exec playwright install chromium
pnpm packages:verify
```

Packing creates a unique .cache/package-release/run-*/artifacts directory, four
tarballs and manifest.json. Verification prepares its own package set and writes
verification.json only on success. It retains a temporary consumer directory for
inspection, containing synthetic text only. It never reads user CSVs or secrets.

Packing uses fresh staging outputs rather than a possibly stale dist directory.
pnpm resolves workspace:* into exact package versions. The manifest records
source commit, dirty state, archive SHA-256, package versions and toolchain.
Preserve it alongside the archives. A dirty checkout plus a commit SHA is not a
reproducible source release; only clean approved commits may become release
candidates.

Install all four archives together in a consumer until dependencies are
available from a registry, or provide types/core/application together for
local-only use. The offline installation test supplies every package directly,
ensuring npm can resolve exact internal versions without requesting unpublished
packages. An example consumer should use relative file paths and retain its
lockfile, not sibling-source imports, workspace symlinks or machine-specific
paths. Do not replace an existing version's bytes in consumers. Development
0.0.0 artifacts are identified by their manifest/checksums; they must not be
mistaken for immutable registry releases.

For other browser checks:

```sh
pnpm exec playwright install firefox webkit
MYANLEX_TEST_BROWSER=firefox pnpm packages:verify
MYANLEX_TEST_BROWSER=webkit pnpm packages:verify
```

The node test traps common networking APIs. Browser tests disable network access
after loading the worker, then verify all nine operations and expected errors.
Neither test claims that application reload or a missing worker chunk works
offline. API parity/authentication tests remain in the existing API/SDK suites.
See the
[recorded verification and outstanding checks](quality/package-compatibility.md).

## Versioning strategy

1. Add a changeset for consumer-visible JavaScript changes with
   `pnpm changeset`.
2. Inspect intent with `pnpm release:status`. Changesets does not bump versions
   here.
3. Before the first authorized release, choose an explicit prerelease policy and
   version (for example 0.1.0-beta.0), rather than publishing 0.0.0 or claiming
   1.0.
4. On an approved release branch, use Changesets prerelease/version commands to
   update versions/changelogs, then refresh the pnpm lockfile and review the
   diff. Fixed types/core/application versions move together. SDK dependency
   updates must also be reviewed. Breaking pre-1.0 behavior changes require
   explicit release notes and compatibility review, not a silent patch.
5. Verify a clean candidate with pnpm check, packages:verify, SDK/docs smoke
   tests and the applicable linguistic/security gates. Retain the exact artifact
   hashes.

No version bump, prerelease state, tag or publish workflow is applied
automatically. Changesets handles JavaScript only; record Dart/Python changes in
their native version/changelog files and validate their own packages separately.

## Future authorized publication

Confirm ownership/access for the @myanlex npm scope, pub.dev name and PyPI
project first. Enable appropriate account protections and designate a release
owner. A GitHub repo transfer does not reserve or transfer those registry
identities.

Publish JavaScript dependencies before dependents: types, core, application; SDK
after its required types version exists. Native pnpm packing resolves workspace
references, but a raw npm publish of an unprepared workspace manifest is not our
release procedure. Publish the reviewed tarballs with public access and a beta
dist-tag for beta versions, verify registry integrity/dependency resolution, and
only later promote an approved stable version to latest. Never overwrite a
version; if only some packages publish successfully, resume missing identical
artifacts after registry verification rather than rebuilding or blindly
repeating the set.

Prefer GitHub trusted publishing/OIDC once configured per npm package. Its
registry setup and npm CLI requirements must be checked at enablement; first
publication may require a separately approved bootstrap. Do not grant current
verification jobs id-token: write or registry tokens. Packaging CI only retains
development artifacts.

For Dart, remove publish_to: none only in an authorized release change, update
the version/changelog and run dart pub publish --dry-run in
packages/myanlex_dart before dart pub publish. For Python, retain Private :: Do
Not Upload until approved; build wheel and sdist, validate/install both, then
use an approved PyPI publication path (prefer trusted publishing). Existing
Python CI builds and tests a wheel; that is not a claim that every future
publication gate, including sdist validation, is done.

Initial publication remains blocked on registry identity verification, an
approved version/release scope, clean-candidate evidence and applicable review
gates. A passing packaging suite does not remove developer-preview warnings or
approve linguistic accuracy. Do not update Data Review's pinned archives without
its own review, parity checks and authorization.

## First npm beta: manual walkthrough

These are instructions for a future authorized release, not commands already
executed. Finish the outstanding verification above before uploading anything.
The examples assume an approved first version of `0.1.0-beta.0` for all four
JavaScript packages.

1. Sign in to npm with an account that can create/publish packages in the
   `myanlex` organization. Enable 2FA; complete interactive authentication
   prompts yourself. Never put credentials into this repository or chat.
2. In `.changeset/consumer-package-preparation.md`, change the four `patch`
   entries to `minor` before the first versioning operation. The current patch
   intent would otherwise start from `0.0.1-beta.0`, not `0.1.0-beta.0`.
3. From the repository root, prepare versions (this does not publish):

   ```sh
   npm login --registry=https://registry.npmjs.org/
   npm whoami --registry=https://registry.npmjs.org/
   pnpm changeset pre enter beta
   pnpm changeset version
   pnpm install --lockfile-only
   ```

4. Review all generated versions, dependency changes, changelogs and
   `.changeset/pre.json`. Update preview installation instructions accurately;
   keep linguistic/compatibility warnings. Run the required checks, commit the
   reviewed release preparation, and obtain passing CI on that clean candidate.
   `pre enter` is only for entering prerelease mode, not for every later beta.
5. Run `pnpm packages:verify` on the clean candidate. Use its printed artifacts
   directory, with `manifest.json` and successful `verification.json`. Verify
   its versions, hashes and `dirty: false`; retain this exact archive set.
6. In that artifacts directory, inspect dry-run output for each tarball before
   publishing. Then publish one at a time in dependency order:

   ```sh
   # Example inspection; repeat for each of the four reviewed tarballs.
   npm publish ./myanlex-types-0.1.0-beta.0.tgz --access public --tag beta --dry-run

   # These four commands upload publicly. Only execute after release approval.
   npm publish ./myanlex-types-0.1.0-beta.0.tgz --access public --tag beta
   npm publish ./myanlex-core-0.1.0-beta.0.tgz --access public --tag beta
   npm publish ./myanlex-application-0.1.0-beta.0.tgz --access public --tag beta
   npm publish ./myanlex-sdk-0.1.0-beta.0.tgz --access public --tag beta
   ```

   Confirm npm's public registry is selected (including any scope-specific
   configuration), and stop if a publish fails. A dry-run does not establish
   account authorization, registry availability or release approval. Verify each
   published version/dependency before proceeding; never overwrite it.

7. In a new consumer project, test `pnpm add @myanlex/application@beta` and
   separately `pnpm add @myanlex/sdk@beta`. Do not use `latest` for this beta.

Manual tarball publishing is supported by
[npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/). The
prerelease state is managed by
[Changesets](https://changesets.dev/guide/prereleases). The workspace root stays
private; do not run a blanket recursive publish.

## First Python beta: manual walkthrough

Python distribution names have no npm-style organization prefix. Verify that
`myanlex-python` is available or controlled by you on PyPI. The import remains
`myanlex`. PyPI and TestPyPI have separate accounts, tokens and project
ownership; your npm organization does not reserve either name.

For an approved `0.1.0b1` beta, update the version in
`packages/myanlex_python/pyproject.toml`, remove the `Private :: Do Not Upload`
classifier, and review the README, project metadata and release notes. Removing
that classifier is an intentional release change, not part of this preparation
milestone. Verify/commit the release changes before creating final artifacts.

From the repository root, use an isolated tool environment and a fresh output
directory so old release files cannot be uploaded accidentally:

```sh
python3 -m venv .cache/publishing-venv
source .cache/publishing-venv/bin/activate
python -m pip install --upgrade build twine
python_dist_dir="$(mktemp -d)"
python -m build packages/myanlex_python --outdir "$python_dist_dir"
python -m twine check "$python_dist_dir"/*.whl "$python_dist_dir"/*.tar.gz
```

The wheel (`.whl`) is the installable distribution; the `.tar.gz` is the source
distribution. Inspect both archives and install/test each in a separate clean
virtual environment, including the existing SDK smoke test. `twine check`
validates distribution metadata/rendering, not runtime correctness or privacy.

After that review, these commands upload publicly, first to the test registry,
then to production only after successful TestPyPI verification:

```sh
python -m twine upload --repository testpypi --username __token__ "$python_dist_dir"/*.whl "$python_dist_dir"/*.tar.gz
# Separate approval and production PyPI credentials are required for this upload.
python -m twine upload --username __token__ "$python_dist_dir"/*.whl "$python_dist_dir"/*.tar.gz
```

Enter the appropriate registry's API token at the hidden prompt, never in a
command argument, tracked file or chat. A first manual upload may need an
account-scoped token; replace/revoke it in favor of project-scoped credentials
after bootstrap. TestPyPI uploads are public releases to a test registry, not
dry-runs. Test its exact package with
`--index-url https://test.pypi.org/simple/` and `--no-deps` after installing
declared dependencies from normal PyPI; avoid mixing indexes with
`--extra-index-url`. Validate the same retained artifacts before production
upload.

After production publication, consumers can run
`python -m pip install 'myanlex-python==0.1.0b1'`. Python beta versions use
`0.1.0b1`, not npm's `0.1.0-beta.0`. See the
[Python packaging tutorial](https://packaging.python.org/en/latest/tutorials/packaging-projects/).
For recurring releases, prefer a separately approved
[PyPI trusted-publisher workflow](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/)
instead of long-lived upload tokens.

## Official references

- [pnpm workspace packing](https://pnpm.io/workspaces#publishing-workspace-packages)
- [Changesets configuration](https://changesets.dev/guide/config)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [Dart publishing](https://dart.dev/tools/pub/publishing)
- [Python packaging](https://packaging.python.org/en/latest/tutorials/packaging-projects/)
