# MyanLex corpus

This directory contains reviewed regression cases that define expected
linguistic behavior. Corpus data is a first-class project artifact, not
incidental test fixture data.

## Areas

- `syllabification/`
- `encoding/`
- `normalization/`
- `transliteration/`

Each area will define its own JSON schema before accepting data. Every dataset
must include provenance, redistribution terms, transformation history, and
review status. See [CONTRIBUTING.md](../CONTRIBUTING.md) before adding material.

The repository's MIT License covers original project-authored corpus cases
unless a dataset-specific notice says otherwise. Third-party data retains its
own license.
