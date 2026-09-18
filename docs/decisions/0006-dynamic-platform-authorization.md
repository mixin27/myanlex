# ADR 0006: Persist platform authorization as roles and permissions

## Status

Accepted

## Context

The developer platform needs organization membership, project management, API
keys, and usage visibility. Fixed role enums would make authorization changes a
code and database migration concern, and role names are not stable permission
boundaries. The language engine must remain independent of all platform data.

API clients and signed-in portal users are different principals. A bearer API
key must not silently become a dashboard login mechanism.

## Decision

PostgreSQL stores organization-owned `roles`, global `permissions`, and the
many-to-many `role_permissions` relation. An organization member references a
role from the same organization through a composite foreign key. Authorization
checks use permission keys; they do not branch on role names or TypeScript
enums.

API keys belong to projects and may receive permissions through
`api_key_scopes`. Only SHA-256 key hashes and short display prefixes are stored.
The full high-entropy key will be returned only by the future creation command.
The existing environment key remains an explicit, unpersisted bootstrap identity
for local development.

Usage records contain project and key identifiers, endpoint, status, character
count, request units, and processing time. Raw submitted text is never stored.

The Prisma adapter belongs to `apps/api/src/infrastructure`; neither
`@myanlex/application` nor `@myanlex/core` depends on it.

## Consequences

- Organizations can change role permission sets without deploying new code.
- Role names are presentation data rather than authorization policy.
- API-key scopes and member permissions share one permission vocabulary.
- Account authentication is still required before exposing control-plane
  project, key, member, or role mutations.
- Usage writes are an initial operational record, not yet a billing ledger;
  aggregation and durable delivery require later hardening.
