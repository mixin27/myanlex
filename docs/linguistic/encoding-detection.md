# Unicode and Zawgyi detection

## Profile and scope

`zawgyi-unicode-v1` detects whether Myanmar-range text provides strong evidence
for standard Unicode, Zawgyi, both in separate runs, or neither. Detection is
non-mutating and remains separate from conversion.

The profile uses the trained Markov model from Google Myanmar Tools 1.2.0. The
model was chosen instead of handwritten regular expressions because standard
Unicode for languages such as Shan and Mon can resemble Zawgyi to Burmese-only
rules. The model was trained with multiple Myanmar-script languages to reduce
that failure mode.

## Result states

- `unicode`: at least one run has strong standard-Unicode evidence and none has
  strong Zawgyi evidence;
- `zawgyi`: at least one run has strong Zawgyi evidence and none has strong
  standard-Unicode evidence;
- `mixed`: separate Myanmar runs contain strong evidence for both encodings;
- `unknown`: Myanmar characters are present, but no run crosses either
  threshold;
- `non_myanmar`: no character from a supported Myanmar block is present.

The detector returns only Myanmar-range segments. Each segment preserves its
text and zero-based, half-open code-point span and includes the upstream model's
Zawgyi probability when the model has a signal.

## Conservative thresholds

Google Myanmar Tools returns a probability between zero and one under the
assumption that the input is either Zawgyi or standard Unicode. The MyanLex v1
profile classifies each contiguous Myanmar run as follows:

```text
probability <= 0.05  -> unicode
probability >= 0.95  -> zawgyi
otherwise            -> unknown
no model signal       -> unknown
```

This uncertainty band is intentional. Some strings have identical encodings in
the common subset, especially short consonant strings, punctuation, and digits.
They cannot be identified reliably and must not be guessed for automatic
conversion.

Overall `confidence` is the strongest supporting probability for a single
encoding. For `mixed`, it is the weaker of the strongest Unicode and Zawgyi
signals. It is `null` for `unknown` and `non_myanmar`.

## Segmentation and mixed input

A detection segment is a maximal contiguous run of characters in the Myanmar,
Myanmar Extended-A, Myanmar Extended-B, or Myanmar Extended-C blocks.
Non-Myanmar text separates runs and is otherwise ignored.

`mixed` therefore means that different runs have strong opposing evidence. The
v1 API cannot reliably locate an encoding switch inside one uninterrupted
Myanmar run; the model supplies one probability for that entire run.

## Non-goals and safety

This profile does not:

- identify the language written in Myanmar script;
- assert that `unicode` text is valid Burmese;
- convert or normalize input;
- label ambiguous input merely because it contains Myanmar characters; or
- guarantee perfect detection, which is impossible for the shared subset.

Automatic conversion should require explicit input encoding or strong Zawgyi
evidence. Callers should preserve the original text whenever conversion is
performed in a later milestone.

## Provenance and license

The adapted detector and embedded model retain their Apache-2.0 license and are
documented in `THIRD_PARTY_NOTICES.md`. The regression corpus is
`corpus/encoding/detection-v1.json` and is marked `source_verified`.

## References

- [Unicode Myanmar FAQ](https://www.unicode.org/faq/myanmar.html), including the
  limits of distinguishing strings in the shared subset.
- [Google Myanmar Tools](https://github.com/google/myanmar-tools), detector
  model, compatibility fixtures, and threshold guidance.
