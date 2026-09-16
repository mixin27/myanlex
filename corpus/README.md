# MyanLex corpus

This directory contains reviewed regression cases that define expected
linguistic behavior. Corpus data is a first-class project artifact, not
incidental test fixture data.

## Areas

- `character-classification/`
- `sequence-recognition/`
- `syllabification/`
- `encoding/`
- `normalization/`
- `transliteration/`

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

The repository's MIT License covers original project-authored corpus cases
unless a dataset-specific notice says otherwise. Third-party data retains its
own license.
