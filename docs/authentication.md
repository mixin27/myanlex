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
deployment credentials. Project creation, API-key management and organization
onboarding are subsequent platform work; signing in does not create a project.
