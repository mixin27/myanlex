# Safe Unicode normalization

## Default profile

MyanLex safe normalization applies Unicode Normalization Form C (NFC) to the
complete input string.

NFC performs canonical decomposition, canonical ordering, and canonical
composition. Its output is canonically equivalent to its input. MyanLex does not
use compatibility normalization (`NFKC` or `NFKD`) in the safe profile because
compatibility mappings may remove distinctions in appearance or behavior.

## Myanmar-specific effects

Unicode 17.0.0 defines one canonical decomposition inside the supported Myanmar
blocks:

```text
U+1026 MYANMAR LETTER UU
  -> U+1025 MYANMAR LETTER U
     U+102E MYANMAR VOWEL SIGN II
```

NFC composes the adjacent decomposed sequence into `U+1026` when the canonical
composition rules permit it.

Four Myanmar characters have non-zero canonical combining classes:

| Code point | Name                                    | Canonical combining class |
| ---------- | --------------------------------------- | ------------------------: |
| `U+1037`   | MYANMAR SIGN DOT BELOW                  |                         7 |
| `U+1039`   | MYANMAR SIGN VIRAMA                     |                         9 |
| `U+103A`   | MYANMAR SIGN ASAT                       |                         9 |
| `U+108D`   | MYANMAR SIGN SHAN COUNCIL EMPHATIC TONE |                       220 |

Canonical ordering can therefore move `U+1037` before an immediately preceding
asat or virama. The Unicode Myanmar specification calls out this behavior
explicitly.

## Guarantees

The safe normalizer:

- returns valid JavaScript strings without dropping code units;
- is deterministic for the supported runtime and assigned repertoire;
- is idempotent;
- preserves canonical equivalence;
- reports whether its output differs from its input.

Normalization may change code-point count or order. This operation does not
provide an input-to-output offset map. Downstream classification, sequence
recognition, and segmentation must calculate their offsets from the normalized
output.

## Non-goals

The safe profile does not:

- convert Zawgyi and Unicode;
- correct spelling;
- repair malformed orthographic order;
- reorder characters beyond Unicode canonical normalization;
- remove format controls, whitespace, or punctuation;
- apply compatibility normalization;
- claim that canonically normalized text is linguistically or orthographically
  valid.

Primary references are Unicode Standard Annex #15, _Unicode Normalization
Forms_, the Unicode 17.0.0 Character Database, and the Unicode Standard's
Myanmar section.
