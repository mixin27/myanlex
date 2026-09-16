# ADR-0003: Pin character data to Unicode 17.0.0

- Status: Accepted
- Date: 2026-09-16

## Context

JavaScript runtimes embed different Unicode versions. Deriving character classes
from runtime regular expressions would allow MyanLex results to change after a
runtime upgrade, even when the MyanLex package version did not change.

Unicode 17.0.0 is the current released version of the Unicode Standard. Unicode
18.0 is still a draft at the time of this decision.

## Decision

MyanLex character data is pinned to Unicode 17.0.0. Checked-in tables,
documentation, and corpus metadata must state their Unicode version.

Runtime Unicode properties may be used as implementation aids only when the
result is constrained by versioned project data. A Unicode upgrade requires an
explicit change that updates the specification, data tables, corpus, and tests
together.

## Consequences

- Classification is deterministic across supported JavaScript runtimes.
- Newly assigned characters are not recognized until MyanLex deliberately
  upgrades its Unicode data.
- Unicode upgrades are reviewable compatibility changes.
