# 0009 — Scoped project API keys

Status: accepted.

Keys are project-owned machine credentials, not account sessions. Creating,
listing and revoking keys requires a verified session, organization membership
and the current `api_key.create`, `api_key.read` or `api_key.revoke` permission.
Role names have no special meaning. Writes retain the trusted-Origin check.

Only explicitly delegable machine capabilities may be granted. The initial
capability is `api.invoke`; the creator must also hold it. Administrative
permissions and wildcards are never accepted. This allowlist describes API
capabilities, not an enum of roles. Capabilities are persisted through the
existing permission and API-key-scope relations.

Secrets contain 32 cryptographically random bytes, encoded as base64url after
`mylx_`. Creation returns plaintext once with `private, no-store`. Persistence
contains only SHA-256, a short display prefix, scope grants and lifecycle
metadata. Lists and revocation responses explicitly project safe fields. Secrets
must not enter logs, URLs, local storage, analytics or error messages.

Expiration is optional and must be a future UTC instant. The console recommends
90 days. Revocation is irreversible and idempotent; repeated or concurrent
requests preserve the first revocation timestamp. Rows remain for usage
relationships. Authentication checks expiration and revocation for each request;
requests already authorized before revocation may finish.

Keys retain their scope snapshot when the creator's role changes or membership
ends; they belong to the project, not to that member. Revoke project credentials
explicitly during offboarding. No automatic creator-based revocation is implied.

The existing schema suffices, so no database migration is required. Distributed
rate limiting, usage aggregation, invitations and role-editing UI are separate
milestones. This change does not alter linguistic processing or public offsets.
