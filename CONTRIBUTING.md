# Contributing to MyanLex

Thank you for helping improve Myanmar-language tooling.

## Before starting

For substantial features or linguistic-rule changes, open an issue first so the
behavior and evidence can be reviewed before implementation. Small fixes and
documentation improvements can go directly to a pull request.

By contributing, you agree that your contribution is licensed under this
repository's MIT License and that you have the right to submit it.

## Setup

```sh
corepack enable
pnpm install
pnpm check
```

Node.js 22 or newer and pnpm 10 are required.

## Pull requests

- Keep each change focused.
- Add or update tests for behavioral changes.
- Use a changeset once packages begin publishing; package publishing is not
  configured yet.
- Update architecture documentation when package boundaries change.
- Do not introduce framework, database, or environment dependencies into
  `@myanlex/core`.
- Explain any public-contract or performance impact in the pull request.

## Linguistic changes

Linguistic behavior must be supported by an authoritative reference, a qualified
reviewer, or a documented project decision. A change normally includes:

1. A specification update under `docs/linguistic/`.
2. Corpus cases with provenance.
3. Automated tests.
4. The implementation.

If sources disagree, describe the disagreement in the pull request. Do not
silently select the behavior that is easiest to implement.

## Corpus contributions

Every contributed dataset or example collection must document:

- its source or how it was created;
- its author or maintainer, when known;
- its license or permission for redistribution;
- transformations applied to it;
- the reviewer and review date, when manually verified.

Do not contribute scraped, private, or copyrighted text without clear
permission.

## Commit and review quality

Use clear, imperative commit subjects. Pull requests should describe what
changed, why it changed, and how it was verified. Maintainers may request
linguistic review independently from code review.
