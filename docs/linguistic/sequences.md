# Myanmar sequence recognition

## Scope

This layer recognizes a small set of encoded Myanmar structures without
assigning syllable boundaries or changing the input. It operates on Unicode code
points and returns zero-based, half-open code-point spans.

Recognition is conservative. Incomplete, malformed, or currently unsupported
patterns remain individual scalar tokens.

## Burmese kinzi

The Burmese kinzi prefix is encoded as:

```text
U+1004 MYANMAR LETTER NGA
U+103A MYANMAR SIGN ASAT
U+1039 MYANMAR SIGN VIRAMA
```

It is recognized as `kinzi` only when immediately followed by a Burmese base
consonant in `U+1000..U+1021`. The following consonant remains a separate scalar
token so later parsing can treat it as the orthographic base.

This milestone recognizes the Burmese NGA form only. Mon kinzi and repha-like
sequences documented by UTN #11 require language-aware rules and remain future
work.

## Burmese consonant stacks

A stack is encoded with a virama between consonants. This milestone emits a
`stack` token for the virama and following consonant when:

1. the preceding scalar is a Burmese base consonant;
2. the current scalar is `U+1039 MYANMAR SIGN VIRAMA`; and
3. the following scalar is in the documented set of known Burmese subjoined
   consonants.

The initial target set follows UTN #11:

```text
U+1000..U+1019, U+101C, U+101E, U+1020, U+1021
```

Repeated stacks are recognized independently, allowing structures such as
`<C, virama, C, virama, C>` without merging an entire cluster into one token.

After NFC, `U+1037 MYANMAR SIGN DOT BELOW` may occur between the base consonant
and virama because its canonical combining class is lower. The recognizer
permits that one canonically ordered mark while locating the preceding base.

## Non-goals

This layer does not:

- determine syllable boundaries;
- validate complete orthographic order;
- normalize or reorder input;
- infer a language from the text;
- recognize Mon kinzi, repha, or every stack used by every language written in
  Myanmar script.

Primary references are the Unicode Standard's Myanmar section and Unicode
Technical Note #11, _Representing Myanmar in Unicode_.
