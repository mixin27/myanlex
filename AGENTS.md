# MyanLex repository guidance

MyanLex is an open-source Myanmar-language processing project. Linguistic
correctness, deterministic behavior, and public-contract stability are higher
priorities than implementation convenience.

## Sources of truth

Use these sources in order:

1. `docs/linguistic/`
2. `corpus/`
3. Passing tests
4. `docs/decisions/`

Documents in `local/` are planning drafts, not authoritative specifications. If
a rule is missing or ambiguous, document the ambiguity instead of inventing
linguistic behavior.

## Architecture

Dependency direction is:

```text
Applications -> application services -> @myanlex/core -> pure domain types
```

`@myanlex/core` must not depend on web frameworks, databases, HTTP,
authentication, environment variables, logging infrastructure, or deployment
tooling.

Public offsets use Unicode code-point offsets. They are not UTF-8 byte offsets,
JavaScript UTF-16 code-unit offsets, or grapheme-cluster offsets.

## Change requirements

- Keep functions small, deterministic, explicit, and testable.
- Centralize Myanmar character classification and linguistic rules.
- Do not scatter Unicode ranges or ad-hoc regular expressions across modules.
- Do not expose internal algorithm names through future public APIs.
- Add regression cases for every linguistic behavior change.
- Never add corpus material without recording its provenance and redistribution
  status.
- Avoid unrelated refactors.

For NLP changes, work in this order:

```text
Specification -> corpus -> tests -> implementation -> regression suite
```

Before declaring work complete, run `pnpm check` and review the diff.
