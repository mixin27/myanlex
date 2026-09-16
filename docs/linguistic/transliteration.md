# Myanmar-to-Latin transliteration

## Profile and scope

`ala-lc-2011-mapping-v1` is MyanLex's first Myanmar-to-Latin profile. It uses
the consonant, vowel, medial, conjunct, final, tone, punctuation, numeral, and
abbreviation mappings in the Library of Congress's 2011 ALA-LC Burmese
Romanization Table.

The public scheme identifier is `ala-lc-2011`. Callers must choose it
explicitly:

```ts
const result = transliterateMyanmar('မြန်မာ', {
  scheme: 'ala-lc-2011',
});

result.output; // 'mranʻmā'
```

The profile accepts standard Unicode Burmese. It does not detect or convert
Zawgyi; callers must perform an explicit Zawgyi-to-Unicode conversion first.

## Mechanical mapping boundary

ALA-LC also specifies lexical word division and contextual capitalization for
cataloging. Those rules require knowledge not recoverable from an arbitrary
Unicode string, including whether a word is a loan and whether a span is a
personal name.

This automated profile therefore implements the source table's deterministic
character and orthographic-sequence mappings while preserving input spacing and
case. It does not insert syllable spaces or infer capitalization. For example,
the adjacent syllable segments in `မြန်မာ` are concatenated as `mranʻmā`.

This boundary is reflected in the profile name: it is a versioned mapping
profile, not a claim that software can reproduce every cataloger's contextual
decision.

## Orthographic behavior

- Unmarked Burmese consonants receive the inherent vowel `a`.
- Dependent vowels replace the inherent vowel.
- Medials are emitted in Unicode's logical order as `y` or `r`, then `v`, then
  `h`.
- Virama suppresses the preceding consonant's inherent vowel; the upper
  consonant is romanized before the subjoined consonant.
- Kinzi is emitted as `ṅ` before the consonant it modifies.
- Asat, anusvara, dot below, and visarga map to `ʻ`, `ṃ`, `ʹ`, and `ʺ`.
- Myanmar digits map to ASCII digits; `၊` and `။` map to comma and period.
- The four ALA-LC abbreviations map to `e*`, `r*`, `n*`, and `l*`.

The output is an orthographic transliteration. It is not a pronunciation guide,
phonetic transcription, translation, or English spelling.

## Preservation and diagnostics

The result contains the original input, output, scheme, profile, a `complete`
flag, and code-point-based segments. Each segment is labelled:

- `transliterated` when the profile mapped a supported Burmese sequence;
- `preserved` for non-Myanmar text and separators; or
- `unsupported` for malformed input or Myanmar characters outside the Burmese
  profile.

Unsupported text is preserved rather than deleted or guessed, and makes
`complete` false. This lets applications display useful partial output without
losing the original data.

## Non-goals

Version 1 does not:

- transliterate non-Burmese languages written in Myanmar script;
- infer pronunciation, voicing, schwa reduction, or exceptional readings;
- transliterate Latin output back to Myanmar;
- normalize malformed text automatically; or
- implement MLCTS, BGN/PCGN, IPA, or a simplified `myanma`-style scheme.

Additional schemes require their own specification, identifier, corpus, and
review. They must not silently change this profile.

## Corpus and review status

The regression corpus is `corpus/transliteration/ala-lc-2011.json`, with schema
`corpus/schema/transliteration.schema.json`. Cases were transcribed from the
official table and supplemented with project-authored composition and fallback
cases. The dataset is `source_verified`; independent linguistic review remains
required before it can be marked `linguistically_reviewed`.

## Reference

- [Library of Congress, Burmese Romanization Table, 2011](https://www.loc.gov/catdir/cpso/romanization/burmese.pdf)
