# Myanmar-aware text tokenization

## Profile and scope

`myanmar-script-tokens-v1` performs deterministic, lossless tokenization for
mixed Burmese, ASCII Latin, numeric, punctuation, whitespace, and emoji text. It
is a lexical/script boundary API, not Burmese dictionary word segmentation.
Burmese units therefore reuse the written syllables defined by
`burmese-orthographic-v1`.

The tokenizer does not normalize, repair, detect Zawgyi, or convert encodings.
Call those explicit APIs first when an application requires them. All spans are
zero-based, half-open Unicode code-point offsets.

## Token kinds and scripts

- `burmese_syllable`: one supported Burmese orthographic syllable, with script
  `myanmar`;
- `latin_word`: a maximal run of ASCII A-Z or a-z, with script `latin`;
- `number`: a maximal run of ASCII digits (`common`) or Myanmar digits
  (`myanmar`); digits from different scripts are never merged;
- `punctuation`: a maximal run of ASCII punctuation (`common`) or U+104A/U+104B
  Myanmar punctuation (`myanmar`); scripts are never merged;
- `whitespace`: a maximal run of Unicode 17 White_Space characters, with script
  `common`;
- `emoji`: one recognized emoji unit, with script `common`;
- `unsupported_myanmar`: a maximal run of Myanmar scalars outside the supported
  Burmese structure, with script `myanmar`; and
- `other`: a maximal run not covered by v1, with script `unknown`.

ASCII-only Latin recognition is intentional. It avoids claiming script support
that the pinned project data does not yet define. Accented Latin, other scripts,
and unclassified symbols remain `other` without data loss.

Adjacent tokens of the same mergeable kind and script are coalesced. Burmese
syllables and distinct emoji units are not coalesced. Concatenating every
token's `text` always reconstructs the exact input.

## Emoji boundaries

Emoji-capable bases use the Unicode 17 `Extended_Pictographic` property. V1 also
recognizes paired regional indicators, keycap sequences, emoji modifiers,
variation selectors, zero-width-joiner sequences, and tag sequences. The
checked-in range table is derived from Unicode 17 `emoji-data.txt`; runtime
Unicode regular expressions are not used.

This is stable token grouping, not a promise to reproduce every extended
grapheme-cluster boundary from Unicode Standard Annex #29.

## Mixed-script report

`scripts` lists the recognized strong scripts (`myanmar` and `latin`) in order
of first appearance. Common and unknown tokens do not add a script.
`mixedScript` is true exactly when both supported strong scripts occur. It does
not claim to detect mixing among scripts that v1 does not classify.

## Corpus and review status

The regression corpus is `corpus/tokenization/myanmar-script-tokens-v1.json`.
Its examples are project-authored from the rules above and contain no copied
natural-language corpus material. They are `source_verified`, not independently
reviewed by a qualified Burmese linguist.

## References

- [The Unicode Standard 17.0, Chapter 16, _Myanmar_](https://www.unicode.org/versions/Unicode17.0.0/core-spec/chapter-16/)
- [Unicode Emoji 17.0 data](https://www.unicode.org/Public/17.0.0/ucd/emoji/emoji-data.txt)
- [Unicode Technical Standard #51, _Unicode Emoji_](https://www.unicode.org/reports/tr51/)
