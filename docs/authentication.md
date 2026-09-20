# Account authentication

MyanLex uses self-hosted Better Auth in NestJS, with PostgreSQL persistence and
a Next.js/shadcn account UI. Email/password, Google and GitHub identify users.
Dynamic organization roles and permissions control platform access separately.

## Local setup

1. Start Docker, then run `docker compose --profile auth up -d`.
2. In your existing `apps/api/.env`, set `PORT=3001`, `AUTH_ENABLED=true`, and
   `AUTH_PUBLIC_URL=http://localhost:3000`.
3. Generate a secret using `openssl rand -base64 48` and set `AUTH_SECRET`.
4. Set `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `SMTP_SECURE=false`, and
   `SMTP_FROM=auth@myanlex.local`. Mailpit captures these messages locally.
5. Run `pnpm db:deploy` and `pnpm db:seed`.
6. In `apps/web/.env.local`, set `API_INTERNAL_URL=http://localhost:3001` and
   `NEXT_PUBLIC_API_DOCS_URL=http://localhost:3001/docs`.
7. Start `pnpm --filter @myanlex/api start:dev` and
   `pnpm --filter @myanlex/web dev` in separate terminals.

Open http://localhost:3000/register and create an account. Open
http://localhost:8025 to follow its verification link, then sign in. The
forgot-password page sends a reset link to the same local inbox. Auth requests
are proxied through the portal; do not point browser clients directly at
port 3001.

Changing API_INTERNAL_URL requires restarting Next.js (and rebuilding production
deployments). AUTH_PUBLIC_URL must be the exact portal origin without a trailing
slash. Use HTTPS and a real SMTP service in production. Secrets stay
server-side. AUTH_ENABLED=false keeps the language API usable without account
authentication.

## Password storage and email verification

Better Auth stores password hashes in `accounts.password` for the account with
`provider_id = 'credential'`. It does not populate `users.password_hash`.
OAuth-only accounts do not need a password. Never copy hashes between these
columns or store a plaintext password.

The active verification field is `users.email_verified` (Prisma
`User.emailVerified`). `users.email_verified_at` and `users.password_hash` are
legacy fields retained for migration compatibility, not runtime auth fields. The
initial auth migration copied existing verification timestamps once; editing a
timestamp afterward does not verify an account.

If login reports `Email is not verified`, use **Resend verification** on the
login page and follow the emailed link. Locally, open Mailpit at
http://localhost:8025 after starting `docker compose --profile auth up -d`. Do
not bypass verification by manually editing database fields.

## Portal redirects

`apps/web/src/proxy.ts` performs a lightweight session-cookie presence check on
portal routes and redirects signed-out visitors to `/login`. Auth endpoints,
verification/reset pages, OAuth callbacks and static assets are excluded. Cookie
presence is not proof of authentication: the server session helper still
validates the session against NestJS before protected rendering/data access.
Login and registration redirect verified, authenticated users to `/dashboard`
only after server validation, avoiding redirect loops caused by stale cookies.
Future protected data access and mutations must check sessions and permissions
independently of Proxy.

## OAuth providers

Create a Google OAuth web client and/or GitHub OAuth App, then set the matching
CLIENT_ID and CLIENT_SECRET pair in apps/api/.env:

- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET

Register these callback URLs, replacing the origin for your deployment:

- http://localhost:3000/api/auth/callback/google
- http://localhost:3000/api/auth/callback/github

Restart the API. Configured providers appear on the login page. OAuth is
optional; email/password does not require either provider. For an existing email
account, sign in first and use Account → Link Google/GitHub. Matching email
addresses are not automatically linked during social sign-in. Provider failures
return to login.

## Account protocol

All paths below are under /api/auth. POST calls require an Origin header
matching AUTH_PUBLIC_URL and JSON bodies. Browser clients use same-origin
cookies.

| Method | Path                     | Purpose                                               |
| ------ | ------------------------ | ----------------------------------------------------- |
| GET    | /providers               | Public enabled status and provider names              |
| POST   | /sign-up/email           | Register name, email, password; send verification     |
| POST   | /sign-in/email           | Create a session for a verified account               |
| POST   | /send-verification-email | Resend verification                                   |
| GET    | /verify-email            | Consume verification link                             |
| POST   | /request-password-reset  | Send a reset link without revealing account existence |
| GET    | /reset-password/:token   | Redirect the emailed reset link to the portal         |
| POST   | /reset-password          | Set password with a valid token; revoke sessions      |
| GET    | /get-session             | Validate current cookie session                       |
| POST   | /sign-out                | Revoke the current session                            |
| GET    | /list-sessions           | List the signed-in user's sessions                    |
| POST   | /revoke-session          | Revoke one of the user's sessions                     |
| POST   | /revoke-other-sessions   | Sign out other devices                                |
| POST   | /sign-in/social          | Start configured OAuth sign-in                        |
| GET    | /callback/:provider      | Validate OAuth response and create session            |
| POST   | /link-social             | Start explicit authenticated account linking          |

Other built-in account endpoints follow the installed Better Auth protocol. This
namespace uses Better Auth errors; the NLP /v1 API retains its own OpenAPI and
problem-details contract. Do not send an NLP API key to authenticate a user.

## Verification

`pnpm check` covers account registration, verification, login, logout, reset
token reuse, session revocation/expiry, invalid cookies, unsafe origins and
redirects, and transport body limits. PostgreSQL integration tests run when
MYANLEX_TEST_DATABASE_URL points to a migrated, disposable test database (CI
provides one). Tests never send real email or contact OAuth providers.

Live Google/GitHub authorization and SMTP delivery must also be checked with
deployment credentials. Organization onboarding and project management are
available after signing in; see [platform.md](platform.md). Signing in does not
automatically create an organization or project. API-key management remains
subsequent work.
