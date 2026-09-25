# MyanLex corpus

This directory contains source-verified regression cases that define expected
linguistic behavior. Corpus data is a first-class project artifact, not
incidental test fixture data.

Source verification is not independent linguistic review. Run
`pnpm quality:report` for per-feature results, provenance declarations and the
pending review queue. See the [quality workflow](../docs/quality/README.md) and
[coverage-gap review](../docs/quality/coverage-gaps.md). The report never
upgrades review status or certifies linguistic accuracy.

## Areas

- `character-classification/`
- `sequence-recognition/`
- `syllabification/`
- `orthography-validation/`
- `encoding/`
- `normalization/`
- `transliteration/`
- `tokenization/`

Each area defines its JSON schema before accepting data. Every dataset must
include provenance, redistribution terms, transformation history, and review
status. See [CONTRIBUTING.md](../CONTRIBUTING.md) before adding material.

The initial character-classification corpus is derived from the Unicode
Character Database rather than from natural-language text. Its schema is
`schema/character-classification.schema.json`.

Normalization cases use the profile named in each corpus file and must remain
idempotent in addition to matching their expected output.

The first syllabification corpus defines `burmese-orthographic-v1`. It contains
project-authored, source-verified regression cases. It has not yet received the
independent linguistic review required for `linguistically_reviewed` status.

Orthography-validation cases define structural diagnostics and their code-point
spans. They do not claim to validate dictionary spelling or linguistic meaning.

Encoding-detection cases use the Apache-2.0 Google Myanmar Tools compatibility
fixtures and model. Dataset-specific license metadata overrides the repository's
default MIT corpus license where stated.

Encoding-conversion cases define the explicit `cldr-zawgyi-v1` profile. The
embedded rules and 126 Google data-driven cases retain Apache-2.0; Rabbit
compatibility cases retain WTFPL. Conversion direction is always part of each
case.

Transliteration cases define the mechanical `ala-lc-2011-mapping-v1` profile.
They are source-verified against the Library of Congress table and preserve
input spacing rather than attempting lexical word division or capitalization.

Tokenization cases define the lossless `myanmar-script-tokens-v1` profile. They
exercise Burmese syllables, mixed-script runs, and Unicode 17 emoji data; they
do not claim Burmese dictionary word segmentation.

The repository's MIT License covers original project-authored corpus cases
unless a dataset-specific notice says otherwise. Third-party data retains its
own license.
