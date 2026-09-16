# ADR-0002: Use Unicode code-point offsets

- Status: Accepted
- Date: 2026-09-16

## Context

UTF-8 byte offsets and JavaScript UTF-16 code-unit offsets are runtime-specific
and can split supplementary Unicode characters. Grapheme clusters are useful for
user-interface navigation but depend on segmentation rules that differ from
MyanLex linguistic units.

## Decision

All public MyanLex text spans use zero-based, half-open Unicode code-point
offsets: `[start, end)`.

Implementations must iterate by code point explicitly. In JavaScript and
TypeScript, string indexing and `String.length` must not be used as code-point
counts.

## Consequences

- Offsets remain consistent across supported runtimes.
- JavaScript consumers must convert between code-point and UTF-16 offsets when
  integrating with APIs that use UTF-16 positions.
- Tests must include supplementary characters such as emoji.
