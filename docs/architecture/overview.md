# Architecture overview

MyanLex is built from a framework-independent language engine outward.

```text
Applications and APIs
        |
Application services
        |
@myanlex/core
        |
Pure algorithms and domain types
```

The core owns deterministic text-processing behavior. It does not know about
HTTP, NestJS, databases, authentication, logging infrastructure, environment
variables, or deployment concerns.

## Initial packages

- `@myanlex/types` contains stable domain data structures shared at public
  boundaries.
- `@myanlex/core` contains Unicode handling and, as specifications mature,
  detection, normalization, conversion, syllabification, transliteration, and
  tokenization.

Feature modules initially remain inside `@myanlex/core`. They should become
independently published packages only when a concrete consumer or versioning
requirement justifies that boundary.

## Delivery order

1. Linguistic specifications and corpus schemas.
2. Unicode scanner and centralized character classification.
3. Safe normalization and syllabification.
4. Additional language-engine capabilities.
5. Stable OpenAPI contract and HTTP API.
6. SDKs and developer platform.
