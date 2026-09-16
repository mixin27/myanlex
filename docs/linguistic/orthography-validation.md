# Burmese orthography validation

## Profile and scope

`burmese-orthography-v1` checks the encoded structure and component order of
modern Burmese Unicode text. It is a structural validator, not a dictionary or
spell checker: `valid: true` means that no supported structural rule was
violated, not that every word is correctly spelled or meaningful Burmese.

Validation is non-mutating. The result contains the original input, a boolean,
and zero or more error diagnostics with Unicode code-point spans. Non-Myanmar
text, whitespace, and punctuation are allowed and ignored by the validator.

The profile is intentionally Burmese-only. Unsupported Myanmar characters are
reported rather than interpreted using rules belonging to Shan, Mon, Karen, or
other languages.

## Validated rules

Within each syllable recognized by `burmese-orthographic-v1`, components follow
the relative order in Unicode 17 Table 16-4:

1. kinzi;
2. base letter;
3. subscript consonants;
4. asat and medials ya, ra, wa, and ha;
5. vowel e, upper vowels, lower vowels, and vowel aa;
6. anusvara, dot below, and visarga.

The validator also supports the source-documented final-consonant, virama-chain,
Great Sa, and written-contraction structures used by the syllabifier. It reports
repeated components within the same component slot.

Unicode notes that normalization can reorder some combinations of asat and dot
below. Both orders are accepted as equivalent. Validation does not normalize the
input; callers can use `normalizeUnicode()` separately.

## Diagnostics

Every diagnostic currently has severity `error` and a half-open code-point span:

- `component_order`: a recognized component appears after a component that must
  follow it;
- `duplicate_component`: a component slot or asat attachment is repeated;
- `orphan_mark`: a dependent Burmese mark has no supported base;
- `dangling_virama`: virama has no following consonant;
- `unsupported_stack_target`: the following consonant has no supported modern
  Burmese subjoined form;
- `invalid_syllable_start`: a dependent letter such as Great Sa begins a unit;
- `unsupported_myanmar`: a Myanmar character is outside this Burmese profile.

Diagnostics are observations only. The validator never deletes, reorders, or
replaces text and does not propose an automatic correction where intent is
ambiguous.

## Corpus and review status

The regression corpus is `corpus/orthography-validation/burmese-v1.json`. Cases
are project-authored and marked `source_verified`. They have not yet received
independent review from a qualified Burmese linguist.

## References

- [The Unicode Standard 17.0, Chapter 16, _Myanmar_](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-16/),
  especially Table 16-4 and its canonical-equivalence note.
- Zin Maung Maung and Yoshiki Mikami (2008),
  [_A Rule-based Syllable Segmentation of Myanmar Text_](https://aclanthology.org/I08-3010/).
