# ADR-0001: Keep the language core framework-independent

- Status: Accepted
- Date: 2026-09-16

## Context

MyanLex will eventually expose language processing through APIs, SDKs, and
possibly offline applications. Coupling the linguistic algorithms to the first
web framework or persistence layer would make them difficult to test, reuse, and
publish independently.

## Decision

Language behavior lives in `@myanlex/core`. The package may depend on pure
domain types, but it must not depend on web frameworks, databases, HTTP,
authentication, environment variables, logging infrastructure, or deployment
tooling.

Adapters and applications may depend on the core. The reverse dependency is
prohibited.

## Consequences

- Core behavior can be tested without infrastructure.
- API and storage technology can change without rewriting linguistic logic.
- Integration concerns require explicit adapter layers.
