# Changelog

## Unreleased

- Versioned language operations: detection, explicit Unicode/Zawgyi conversion,
  safe NFC normalization, Burmese orthographic syllabification and validation,
  ALA-LC mapping transliteration, and mixed-script tokenization.
- Batch syllabification and transliteration, bounded inputs and code-point
  spans.
- NestJS API with OpenAPI, Scalar and Swagger references.
- Self-hosted credentials/sessions, optional Google/GitHub login, dynamic
  organization permissions, projects and scoped API-key creation/revocation.
- Best-effort usage reporting, Redis-backed distributed burst limits and opt-in
  organization-wide PostgreSQL monthly quotas.
- Unpublished TypeScript and Dart HTTP SDKs with cancellation and typed errors.
- Dedicated public MDX site with search, code highlighting, language tabs,
  generated OpenAPI reference, and executable request examples.
- Production preparation (not deployed): a Dokploy Compose stack with Postgres
  and Redis on the host, an `ops` image, a release workflow that builds, scans
  and tags GHCR images and runs a smoke check, `ops:daily` with nightly backups,
  a lock and a Healthchecks heartbeat, `config:check` and production
  configuration rules, and `MYANLEX_TRUST_PROXY` for client addresses behind
  proxies.

This is a developer preview, not a production availability or linguistic
accuracy claim. Security/operational hardening and independent linguistic review
remain release gates. SDK publication and paid billing are not included.
