# ADR 0007: Self-hosted accounts and sessions

## Status

Accepted

## Decision

Better Auth runs inside the NestJS application through its Fastify adapter.
PostgreSQL stores its users, credential/OAuth accounts, sessions, verification
records and authentication rate limits. Next.js uses its React client and
proxies only /api/auth/* to the API. The public auth URL is the portal origin;
OAuth callbacks and email links therefore return through the same origin.

Credentials require email verification. Passwords use Better Auth's password
hashing, and password reset revokes existing sessions. Session cookies are
HttpOnly, SameSite=Lax and Secure for HTTPS deployments. Cookie session caching
is disabled so revoked sessions are checked against storage immediately. Google
and GitHub are configured independently. OAuth tokens are encrypted. Implicit
account linking is disabled: a signed-in user explicitly links a provider to the
same email address. Account authentication does not grant organization
permissions; the dynamic role/permission model remains authoritative.

AccountAuthModule owns the integration. It does not add dependencies to the
language engine or application text-processing services. Authentication is
optional for NLP-only deployments and fails closed when disabled. When enabled,
startup validates the database, public URL, secret, SMTP and provider settings.
SMTP is required because verification is mandatory; production SMTP requires
TLS.

## Contracts and boundaries

The checked-in NLP OpenAPI contract continues to describe /v1 language routes.
The /api/auth namespace is a library-owned account protocol, documented in
docs/authentication.md and consumed by the version-matched Better Auth client.
It retains Better Auth error responses rather than wrapping them in NLP problem
details. This is an explicit exception to the NLP-only HTTP contract. The
additional GET /api/auth/providers endpoint exposes only enabled provider names
and whether authentication is enabled, never credentials.

Raw Fastify authentication routes bypass the NLP bearer-key guard and have their
own session, origin, body-size and persisted rate-limit enforcement. Every POST
requires the exact configured portal Origin. OAuth callbacks use GET and are
validated using Better Auth state/PKCE handling. Multiple Set-Cookie headers are
preserved. NLP API keys never become portal sessions.

Next's server session helper verifies sessions without refreshing cookies during
Server Component rendering. The portal layout and account page call it; every
future protected data access or server mutation must independently authenticate
and enforce organization permissions. Layout redirects alone are not
authorization.

## Migration and operation

The migration is additive. Legacy users.password_hash and email_verified_at
columns remain intact; verified timestamps are copied to the new boolean.
Existing password hashes are not silently reinterpreted. Any legacy accounts
must establish a credential through the password-reset flow before password
login; newly registered credentials live in accounts.password.

Rate limits use the API's socket peer IP rather than trusting arbitrary
forwarded headers. Requests behind the portal proxy share that peer's
conservative bucket. Before production scale, configure a trusted ingress and
verified client-IP forwarding; never trust arbitrary X-Forwarded-For headers.
These limits are an initial abuse control, not a complete distributed quota
system.

OAuth credentials, SMTP delivery and deployment URLs are deployment settings.
The repository ships no credentials and does not modify developers' private env
files. Integration tests use fake mail delivery and a dedicated PostgreSQL test
database in CI; external provider authorization requires a configured OAuth app.
