# NLP quality validation and RC1 preparation

Status: preparation tooling, not an RC1 release approval.

## Evidence contract

`pnpm quality:report` runs the existing core regression suite and joins its JSON
results to corpus cases by test file, suite name, and case ID. It must not
reimplement linguistic algorithms or generate expected answers. Every dataset
must be registered; missing, duplicate, skipped, or unmatched case results must
not count as passed. Additional invariant tests remain part of the test gate.

The report records dataset hashes, Git revision and dirty state, case results,
provenance declarations, review status, and a queue of cases awaiting
independent review. Metadata checks verify presence and known review states, not
legal permission or the truth of a linguistic claim. They are not full JSON
Schema validation. Dataset schemas remain authoritative for contributors.

An optional prior report allows comparison by dataset path and case ID. A
previously passing case that now fails is a regression; changed fixtures are
reported separately so expected-answer edits cannot conceal comparison changes.
Without a baseline, failures are failures, not automatically newly introduced
regressions. Removed cases must be visible.

Reports are local generated artifacts under `.cache/nlp-quality/`, excluded from
Git. Do not overwrite or promote corpus review statuses based on test results.
No private `local/` material is copied into the report.

**100% of regression cases passing is not 100% linguistic accuracy.** The suite
is a regression set, not a representative held-out evaluation dataset. It does
not establish population accuracy, language coverage, or release readiness.

## Run and review

```sh
pnpm quality:report
# Compare with a previously retained report; use a separate destination.
pnpm quality:report --baseline /absolute/path/previous/report.json
```

The command prints a unique run directory containing `report.json`, `report.md`,
`review-queue.json`, and raw `vitest.json`. It exits nonzero on test, mapping,
or metadata failures. Outstanding independent review is reported as pending, not
a test failure or automatic release approval. Retain artifacts with the
candidate commit, and rerun on the exact final clean revision before release.

Core test names must retain the full case ID. If a parameterized title is
truncated by the test runner, use explicit `it(case.id, ...)` titles rather than
fuzzy matching truncated names. The report fails closed on unmatched titles.

See [coverage gaps](coverage-gaps.md), [reviewer workflow](reviewer-guide.md),
and [RC1 checklist](rc1-checklist.md). Public feature limitations are documented
in the documentation site's beta limitations page.
