# MyanLex

MyanLex is an open-source, developer-focused toolkit for processing
Myanmar-language text.

The project is being built from the language engine outward: a deterministic,
framework-independent core first, followed by stable APIs and SDKs. Linguistic
correctness and a reviewed regression corpus take priority over implementation
convenience.

## Status

MyanLex is in early development. The current milestone establishes Unicode
code-point handling, deterministic character classification, safe Unicode
normalization, Burmese orthographic syllabification, linguistic specifications,
structural orthography validation, corpus formats, and the core package
boundary.

Do not use the API or package interfaces as stable production contracts yet.

## Planned capabilities

- Myanmar Unicode and Zawgyi detection
- Unicode/Zawgyi conversion
- Unicode normalization
- Myanmar syllabification
- Myanmar-to-Latin transliteration
- Tokenization and mixed-script detection

## Repository layout

```text
packages/
  core/              Framework-independent language engine
  types/             Shared public domain types
corpus/              Reviewed linguistic regression data
docs/
  architecture/      System and package boundaries
  linguistic/        Authoritative linguistic specifications
  decisions/         Architecture decision records
openapi/              Future HTTP API contract
apps/                 Future deployable applications
```

Planning drafts are retained under `local/` for reference. They are not
authoritative specifications.

## Requirements

- Node.js 22 or newer
- pnpm 10.18.3 or a compatible pnpm 10 release

Enable Corepack if pnpm is not already available:

```sh
corepack enable
corepack prepare pnpm@10.18.3 --activate
```

## Development

```sh
pnpm install
pnpm check
```

Useful commands:

```sh
pnpm build
pnpm test
pnpm typecheck
pnpm lint
pnpm format
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Changes to
linguistic behavior must update the specification, corpus, tests, and
implementation together.

## License

MyanLex source code is available under the [MIT License](LICENSE). Corpus
contributions must have clear provenance and compatible redistribution terms.
