# Unicode and Zawgyi conversion

## Profile and scope

`cldr-zawgyi-v1` converts complete strings between standard Myanmar Unicode and
Zawgyi-One. It adapts the generated JavaScript rules from Google Myanmar Tools
1.2.0, whose conversion rules are derived from the Unicode CLDR Zawgyi
transforms.

The profile is intended for Burmese text encoded with Zawgyi-One. It is not a
general converter for arbitrary legacy Myanmar fonts or every language written
in Myanmar script.

## Explicit direction

Conversion never guesses the source encoding. Every call must provide both
`from` and `to`:

```ts
const result = convertMyanmarEncoding('မဂၤလာပါ', {
  from: 'zawgyi',
  to: 'unicode',
});

result.output; // 'မင်္ဂလာပါ'
```

Detection remains advisory and separate. A detection result of `unknown` or
`mixed` must not be fed into the converter as though it identified one source
encoding. Applications that automate conversion should retain the original text
and record the direction they chose.

## Result contract

### Optional application-level source validation

The application and HTTP conversion request accepts `validateSource: true`. This
is a preflight policy around the existing detector and converter, not a change
to either core algorithm. Omission or `false` preserves explicit conversion
behavior. Callers handling pasted text should enable it.

After normal input validation, and before a direction-changing conversion:

1. Reject opposing evidence across runs (`mixed`) with `encoding_mixed`.
2. Reject strong evidence contrary to `from` with `encoding_mismatch`.
3. Reject any `unknown` Myanmar segment with `encoding_uncertain`, even when the
   overall detector result reflects another strongly classified segment.
4. Otherwise allow conversion. Empty/non-Myanmar-only input passes unchanged.

These errors are HTTP 400 application problems, contain no converted output, and
direct the caller to the separate detection endpoint for evidence and code-point
spans. No segment is silently converted, removed or corrected. Equal `from`/`to`
values remain exact no-ops and bypass this preflight.

This policy uses the existing detection corpus and thresholds. Detection remains
probabilistic; a switch within a single Myanmar run may be missed. Passing the
preflight is not a guarantee of valid Burmese, safe conversion for other Myanmar
languages, spelling correctness, or preservation of meaning. Unknown
common-subset text may be rejected even when visually unambiguous to a human.
Keep originals; review the source before deliberately opting out.

The converter returns the original `input`, converted `output`, explicit `from`
and `to` values, a `changed` flag, and the profile identifier. When `from`
equals `to`, conversion is an exact no-op. Non-Myanmar characters that do not
match a conversion rule are preserved.

Zawgyi-to-Unicode output follows the transform's standard-Unicode ordering. This
API does not additionally apply the separate `unicode-nfc` normalization
profile.

## Meaning and reversibility

The rules are designed to preserve the represented Burmese text when the
declared source encoding is correct. No converter can make that guarantee for
mislabelled, mixed, malformed, or font-specific input. Some rules also resolve
contextual ambiguities such as Myanmar zero versus the letter wa.

Unicode-to-Zawgyi is inherently a compatibility operation. Zawgyi has multiple
sequences with equivalent visual results and cannot represent all Unicode
Myanmar text faithfully. Therefore:

- Unicode → Zawgyi → Unicode is tested for representative supported Burmese
  text;
- byte-for-byte Zawgyi → Unicode → Zawgyi round trips are not promised; and
- consumers should treat Unicode as the canonical storage format.

## Corpus and compatibility

The regression corpus is `corpus/encoding/conversion-v1.json`. It includes
project-authored boundary cases, all 126 Google Myanmar Tools data-driven
Zawgyi-to-Unicode fixtures, representative UDHR wording, and the eight
Zawgyi-to-Unicode sample pairs from Rabbit at commit
`081d464a91ab4dde14b799a54d1e89dde55b438e`.

Rabbit is a secondary compatibility reference, not the semantic authority for
this profile. Its eight Zawgyi inputs produce the same Unicode strings under
this implementation. Exact Unicode-to-Zawgyi spellings may differ because
multiple Zawgyi sequences can encode the same displayed text.

## Provenance and license

The embedded Google Myanmar Tools engine and rules retain Apache-2.0. Rabbit
sample cases retain the repository's WTFPL license. Both are recorded in
`THIRD_PARTY_NOTICES.md`; original MyanLex cases remain MIT-licensed.

## References

- [Unicode CLDR Zawgyi transform](https://github.com/unicode-org/icu/blob/main/icu4c/source/data/translit/Zawgyi_my.txt)
- [Google Myanmar Tools](https://github.com/google/myanmar-tools)
- [Rabbit converter](https://github.com/Rabbit-Converter/Rabbit)
