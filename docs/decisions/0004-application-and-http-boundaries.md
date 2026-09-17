# ADR-0004: Separate application services from HTTP adapters

- Status: Accepted
- Date: 2026-09-17

## Context

The core language engine is synchronous, deterministic, and independent of
transport concerns. The public API needs input policy, stable use-case names,
authentication, errors, and versioned HTTP routes without coupling those choices
to linguistic algorithms or to one server framework.

Generated OpenAPI types are also not a suitable internal domain model. They
represent a transport contract and can change for HTTP-specific reasons.

## Decision

`@myanlex/application` is the only package that HTTP adapters call for language
operations. It owns use-case request types, the 100,000-code-point input limit,
well-formed Unicode validation, and stable result envelopes where the core does
not already provide one. It depends on `@myanlex/core`; the core never depends
on it.

`openapi/openapi.yaml` is the authoritative HTTP contract. It uses OpenAPI 3.2.1
and is linted during `pnpm check`. Transport adapters in `apps/` must implement
that contract and translate transport errors without changing core results.

This boundary does not require a specific HTTP framework. The initial adapter
uses NestJS with Fastify, but that choice may change without affecting
application or core contracts.

## Consequences

- Core algorithms remain reusable in CLIs, SDKs, workers, and browsers.
- Input policy is tested once rather than repeated in controllers.
- The HTTP contract can drive documentation and future SDK generation.
- Adapters require explicit mapping for authentication, RFC 9457 problem
  responses, and application input errors.
- Contract changes and domain changes remain separately reviewable.
