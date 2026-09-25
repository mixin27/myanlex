# 0017: Guard explicit conversion; defer automatic mixed-text conversion

Status: accepted

## Context

A sentence can contain both Unicode and Zawgyi. Applying one declared direction
to the entire sentence can damage portions already in the desired encoding. The
desired future experience is to choose a target encoding, preserve matching
portions, and convert only portions in the other encoding.

The current detector classifies contiguous Myanmar runs. It cannot reliably
locate switches within a run; short strings and the shared encoding subset can
be uncertain. Passing regression tests is not proof of linguistic correctness.

## Decision

Keep explicit `from`/`to` conversion stable. Add optional application-level
`validateSource: true`, rejecting detected mixed, mismatched, or uncertain
direction-changing input without partial output. Equal directions remain no-ops.
The default remains unchanged for compatibility. Do not rewrite core conversion
rules or silently guess a source. See the
[conversion specification](../linguistic/encoding-conversion.md).

Defer automatic mixed-text conversion. A future opt-in `from: "auto"` is a
proposal, not an implemented or promised public contract. Evaluate it with
provenance-recorded cases and independently reviewed expected outputs before
adopting it. Include separated and within-run switches, ambiguous common-subset
text, short runs, non-Burmese Myanmar languages, both targets, preservation, and
code-point spans. Do not import private user examples without redistribution
permission.

If adopted, preserve originals, convert only confidently identified portions,
and reject unresolved ambiguity by default. Any future best-effort mode must
report uncertainty and must not claim the whole output has a verified encoding.
Detection confidence alone is not an accuracy or meaning-preservation guarantee.

## Next work

Proceed with NLP quality validation and RC1 preparation: automated corpus
results, coverage gaps, independent-review preparation, and beta limitations.
This records the discussion without expanding the current linguistic behavior.
