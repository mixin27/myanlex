# NLP coverage-gap review

Initial inventory: 2026-09-25. Counts are an inventory, not coverage
percentages; rerun `pnpm quality:report` for current results. All nine datasets
currently have `source_verified` status. No independent linguistic sign-off is
recorded.

| Feature                  | Cases | Existing evidence                                             | Missing evaluation / boundary                                                                                                                                                                |
| ------------------------ | ----: | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Character classification |    36 | Assigned/reserved Unicode 17 scalars                          | Selected examples do not exhaust the pinned tables; add an independently derived full-table audit before claiming exhaustive classification coverage.                                        |
| Sequence recognition     |    13 | Burmese kinzi, supported stacks and fallback                  | No language-aware Mon kinzi/repha support; broader combinations need reviewed evidence.                                                                                                      |
| NFC normalization        |    10 | Composition, canonical ordering, idempotence, mixed text      | Not a full Unicode normalization conformance suite; runtime/version conformance remains separate. No spelling repair or offset mapping.                                                      |
| Syllabification          |    17 | Contractions, stacks, Great Sa, fallback and offsets          | Independent boundaries on licensed natural-language text are missing; units are written syllables, not dictionary words.                                                                     |
| Orthography              |    18 | Structural ordering, duplicates, orphan marks and diagnostics | Need independent assessment of false positives/negatives; structural validity does not establish spelling or meaning.                                                                        |
| Encoding detection       |    11 | Strong, ambiguous, separated mixed runs, Shan, emoji offsets  | No representative held-out accuracy evaluation. Within-run switches are unresolved; one Shan case is not multilingual validation.                                                            |
| Encoding conversion      |   142 | Explicit directions, 126 Google fixtures, 8 Rabbit pairs      | Compatibility is not independent semantic review. Mixed/mislabelled source conversion is unsafe; no automatic mixed-text repair. Both directions need broader reviewed real-text evaluation. |
| Transliteration          |    72 | Table mappings, compositions, preserved unsupported text      | Need independent table/composition review; lexical division, pronunciation and contextual capitalization are outside this profile.                                                           |
| Tokenization             |    15 | Lossless script groups, emoji and code-point spans            | Not Burmese word segmentation or full grapheme conformance. Unknown scripts and non-ASCII Latin are preserved without comprehensive script identification.                                   |

## Prioritized reviewer questions

1. Review syllabification `written-contraction`,
   `kinzi-inside-written-syllable`, `second-final-starts-new-unit`, and
   orthography `canonical-asat-dot-orders`, `kinzi-stack-and-contraction`,
   `unsupported-stack-target`. Do the expected boundaries/diagnostics follow the
   documented profile, including fallback?
2. Review transliteration `modified-pali-example`, `mon-loan-example`,
   `myanmar-name`, and conjunct/final cases against the stated mechanical scope.
   Do not silently expand into cataloging or pronunciation rules.
3. Review conversion source groups independently. A Rabbit/Google agreement is
   compatibility evidence, not two independent judgments of linguistic meaning.
4. Plan a separately licensed held-out evaluation for detection and conversion.
   Include short/common-subset input, non-Burmese languages, malformed input,
   switches between runs and within runs, both targets, and preservation of
   unrelated text. Do not derive the reference answer from MyanLex itself.

These are sampling priorities, not permission to mark an entire dataset reviewed
after checking only these IDs. The generated queue includes every pending case.

## Ambiguities remain explicit

Automatic target-only mixed-text conversion is deferred under
[ADR-0017](../decisions/0017-conversion-source-validation.md). Do not change
detector thresholds, invent syllable boundaries for encoding switches, or add
`from: "auto"` during release preparation. Define a separate evaluation and
specification before proposing such a contract.

Each accepted correction must follow specification → provenance-recorded corpus
→ failing regression → implementation → full regression suite. Record unresolved
disagreements rather than selecting whichever output currently passes tests.
