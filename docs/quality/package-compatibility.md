# Package compatibility verification

## Local preparation run — 2026-09-30

Environment: macOS arm64, Node 24.21.0, pnpm 10.18.3, Playwright 1.63.0. This
tested uncommitted preparation changes on top of
`51d8d6353d7f08fe389e046fac4c5953a70de33b`, not an approved release commit. No
version was bumped and no package, tag or deployment was published.

| Check                        | Result                                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen pnpm lockfile install | Passed with lifecycle scripts disabled                                                                                                                                                       |
| Changesets release plan      | Passed; four pending package patch intents, no versions applied                                                                                                                              |
| `pnpm playground:verify`     | Passed, including fresh/upgrade migrations and `pnpm check` against disposable PostgreSQL 17 and Redis 7                                                                                     |
| `pnpm check` tests           | 670 workspace tests plus 12 tooling tests passed; none skipped                                                                                                                               |
| Packed artifact contents     | Four packages; exact resolved dependencies, ESM/declarations, README/MIT licenses and core third-party licenses present; no source maps/source tree                                          |
| Isolated consumer            | Offline installation with an empty npm cache, runtime import isolation, NodeNext and Bundler typechecking passed                                                                             |
| Local processing             | All nine operations matched the workspace build; conversion in both directions, guarded errors, malformed Unicode, supplementary characters, text limit and partial batch failures exercised |
| SDK without network          | Explicit request failure, one attempt, no embedded-engine fallback                                                                                                                           |
| Chromium 153.0.8010.12       | Loaded worker passed with browser networking disabled and no processing requests                                                                                                             |
| WebKit 26.6                  | Loaded worker passed with browser networking disabled and no processing requests                                                                                                             |
| Firefox                      | Failed before executing tests: browser launch reported `Could not find profile folder`; retry with `/private/tmp` did not fix it                                                             |
| `pnpm sdk:smoke`             | All nine real local API routes, validation and rate limiting passed                                                                                                                          |
| `pnpm dart:sdk:smoke`        | All nine real local API routes passed                                                                                                                                                        |
| `pnpm python:sdk:smoke`      | Sync/async routes, guarded conversion, batch failures, offsets and rate limiting passed using the existing Python 3.12 environment                                                           |
| `pnpm docs:smoke`            | Nine request bodies, exact first response, four runnable examples and rejected credentials passed                                                                                            |

Local evidence is retained in `.cache/package-release/run-GduVKj/artifacts/`
(Chromium) and `.cache/package-release/run-yVKYf1/artifacts/` (WebKit). Both
sets have identical archive hashes recorded in their manifests. These ignored
files are not distributed with source; the compatibility CI workflow retains its
own artifacts for each future run. `dirty: true` explicitly prevents attributing
the tested package contents to the base commit alone.

## Remaining release verification

- Run the new hosted matrix on an authorized push: Node 22.22.3/24.21.0,
  Chromium/Firefox/WebKit on Linux. Configuration alone is not passing evidence.
- Resolve Firefox's local startup failure or obtain passing equivalent CI
  evidence; do not treat the failed launch as a skipped passing test.
- Device Safari/iOS, other browser/Node versions and broader runtime Unicode
  conformance are unverified. Native NFC can depend on runtime Unicode data.
- This milestone's fresh isolated artifact verification covers the four npm
  packages. Dart/Python HTTP contract smoke tests are not a substitute for their
  registry-specific release validation: authorized Dart publish dry-run, Python
  wheel/sdist validation and clean installations remain release gates.
- Repeat required checks on a clean, approved, versioned release candidate.
  Confirm registry ownership and initial prerelease policy before publication.
- Independent linguistic review and existing security/operational release
  requirements remain outstanding. Passing fixture parity is not a linguistic
  accuracy measurement or proof of universal runtime compatibility.

No website offline reload, native Dart/Python local engine, automatic fallback,
CommonJS output or actual registry installation is claimed. See the
[publishing guide](../publishing.md) for the release procedure.
