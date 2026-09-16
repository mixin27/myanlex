# Character classes

## Scope and data version

This specification defines scalar-level classification for MyanLex. It is pinned
to the Unicode Character Database (UCD) 17.0.0.

The supported Myanmar blocks are:

| Block              | Range              |
| ------------------ | ------------------ |
| Myanmar            | `U+1000..U+109F`   |
| Myanmar Extended-B | `U+A9E0..U+A9FF`   |
| Myanmar Extended-A | `U+AA60..U+AA7F`   |
| Myanmar Extended-C | `U+116D0..U+116FF` |

Only code points assigned in UCD 17.0.0 are classified as Myanmar characters.
Reserved positions inside these blocks remain `other`.

Primary data sources:

- Unicode 17.0.0 `Blocks.txt`
- Unicode 17.0.0 `UnicodeData.txt`
- Unicode Standard Annex #44, _Unicode Character Database_

## Classes

| Class                 | Meaning                                                                |
| --------------------- | ---------------------------------------------------------------------- |
| `myanmar_letter`      | An assigned Myanmar letter or modifier letter (`Lo` or `Lm`)           |
| `myanmar_vowel_sign`  | A character explicitly named `MYANMAR VOWEL SIGN`                      |
| `myanmar_medial`      | A character explicitly named `MYANMAR CONSONANT SIGN ... MEDIAL ...`   |
| `myanmar_tone_mark`   | A Myanmar mark explicitly named as a tone or tone mark                 |
| `myanmar_asat`        | `U+103A MYANMAR SIGN ASAT`                                             |
| `myanmar_virama`      | `U+1039 MYANMAR SIGN VIRAMA`                                           |
| `myanmar_mark`        | Another assigned Myanmar combining or spacing mark (`Mn` or `Mc`)      |
| `myanmar_digit`       | An assigned Myanmar decimal digit (`Nd`)                               |
| `myanmar_punctuation` | Assigned Myanmar punctuation (`Po`)                                    |
| `myanmar_symbol`      | Assigned Myanmar symbols (`So`)                                        |
| `ascii_latin_letter`  | `A..Z` or `a..z`                                                       |
| `ascii_digit`         | `0..9`                                                                 |
| `ascii_punctuation`   | Assigned ASCII punctuation characters                                  |
| `whitespace`          | A code point with the Unicode `White_Space` property in Unicode 17.0.0 |
| `other`               | Any scalar not covered above, including reserved code points           |

These classes describe encoded scalars, not complete linguistic roles. In
particular, `myanmar_letter` does not yet claim that a character is a consonant
or independent vowel for every language written with Myanmar script.

## Sequences are not character classes

Kinzi and stacked consonants are encoded sequences and must be recognized by a
later sequence parser:

- kinzi begins with `U+1004 U+103A U+1039`;
- stacking involves a virama followed by a letter.

The scalar classifier reports the components independently. It must not label an
individual code point as `kinzi` or `stacked_consonant`.

## Stability

Classification is deterministic and independent of the Unicode data embedded in
Node.js. Upgrading the pinned Unicode version requires updating this
specification, the checked-in tables, corpus metadata, and tests.
