# Burmese orthographic syllabification

## Profile and scope

`burmese-orthographic-v1` segments modern Burmese Unicode into written,
orthographic syllable units. These are not words, and a returned unit is not
always one phonological syllable. Some encoded stacks and contractions cannot be
split without dividing one written cluster.

The profile is intentionally limited to Burmese behavior supported by the
Unicode Standard and the published rule-based analysis cited below. Characters
used by Shan, Mon, Karen, and other languages written in Myanmar script are not
silently interpreted as Burmese.

The function is lossless: concatenating every returned segment's `text`
reconstructs the exact input. It does not normalize, repair, or reorder text.
Call the separate safe Unicode normalizer first when NFC is required.

## Segment kinds

- `burmese_syllable`: a recognized modern Burmese written syllable, independent
  sign, or digit;
- `separator`: whitespace, ASCII punctuation, or U+104A/U+104B Myanmar
  punctuation;
- `non_myanmar`: a maximal run of other non-Myanmar characters between
  separators and Myanmar characters;
- `unsupported_myanmar`: one Myanmar scalar that cannot begin a supported
  Burmese syllable at that position.

All spans are zero-based, half-open Unicode code-point offsets.

## Supported structure

The base structure follows the Unicode 17 modern Burmese syllabic structure:

1. an optional kinzi prefix `<U+1004, U+103A, U+1039>`;
2. a Burmese consonant or documented independent base;
3. encoded medials, dependent vowels, asat, and dependent signs;
4. supported virama-plus-consonant stacks; and
5. an optional second consonant devowelised by asat.

The boundary rules additionally preserve these documented written structures:

- no break before a second consonant when it is followed by asat;
- no break across a supported virama consonant chain;
- no break within kinzi and its following base;
- no break before U+103F MYANMAR LETTER GREAT SA; and
- no break inside a written contraction where a final consonant also serves the
  following syllable, such as `ယောက်ျား`.

The current supported subjoined-consonant set is shared with the conservative
sequence-recognition milestone:

```text
U+1000..U+1008, U+100A..U+1019,
U+101B, U+101C, U+101E, U+1020, U+1021
```

Myanmar digits U+1040..U+1049 and independent signs U+104C, U+104D, and U+104F
are emitted as individual stand-alone syllable units. U+104A and U+104B are
separators.

## Conservative failure behavior

A dependent mark or virama that appears without a recognized base is emitted as
`unsupported_myanmar`. The same is true for Myanmar-script letters outside this
Burmese profile. This status means only that v1 has no supported interpretation;
it does not declare the text invalid in every Myanmar-script language.

The segmenter does not yet diagnose every illegal Burmese spelling order. Once a
base has been recognized, supported combining characters remain attached so the
API does not fabricate boundaries inside a displayed cluster. A future
orthographic validator can report ordering errors separately.

## Corpus and review status

The source-verified regression corpus is
`corpus/syllabification/burmese-orthographic-v1.json`. Its cases are manually
constructed, MIT-licensed examples rather than copied natural-language corpus
material. `source_verified` does not mean review by a qualified Burmese
linguist; that stronger status remains future work.

## References

- [The Unicode Standard 17.0, Chapter 16, _Myanmar_](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-16/),
  especially Table 16-4.
- Zin Maung Maung and Yoshiki Mikami (2008),
  [_A Rule-based Syllable Segmentation of Myanmar Text_](https://aclanthology.org/I08-3010/),
  IJCNLP workshop proceedings.
