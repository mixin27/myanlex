# Developer console, organizations, projects and API keys

## Local workflow

Use the setup in [authentication.md](authentication.md), apply migrations and
seed with `pnpm db:deploy` and `pnpm db:seed`, then start the API and web app.
No new database migration is needed for this milestone; it uses the existing
organizations, roles, permissions, memberships and projects tables.

1. Register, verify the email through Mailpit, and sign in.
2. Open Dashboard → Create your first organization (or Projects).
3. Enter a display name and unique slug. Names support Unicode; slugs use
   lowercase ASCII letters/numbers separated by single hyphens.
4. Create a project with a name, organization-local slug and environment.
5. Use Edit to change its name, slug or environment. Changing organizations
   changes the project list; the API independently enforces access.

Create another organization using New workspace. The console calls organizations
workspaces, while API and database names remain unchanged. Organization
selection is stored in the URL; list pages use explicit next-page links. Empty,
loading, permission-denied and failure states do not display fabricated usage or
subscription information.

## API

The checked-in `openapi/openapi.yaml` is authoritative. Routes are under
`/v1/platform/organizations`:

| Method | Suffix                               | Operation                                                   |
| ------ | ------------------------------------ | ----------------------------------------------------------- |
| GET    | /                                    | List organizations for the current member                   |
| POST   | /                                    | Atomically create organization, role, grants and membership |
| GET    | /:organizationId                     | Read organization and current member permissions            |
| GET    | /:organizationId/projects            | List projects with project.read                             |
| POST   | /:organizationId/projects            | Create with project.create                                  |
| PATCH  | /:organizationId/projects/:projectId | Update with project.update                                  |

List requests accept `limit` (1–100, default 25) and optional `after` (the
previous response's `nextCursor`). Responses contain `items` and `nextCursor`.
Updates are partial and require at least one field; omitted environment is
preserved, not reset to development. Ownership, role and permission fields are
not accepted in request bodies.

All routes require a verified cookie session; bearer API keys are not accepted.
POST/PATCH require the exact `AUTH_PUBLIC_URL` Origin, including scheme and
port. No membership returns 404; a member lacking the operation's permission
receives 403; duplicate slugs return 409. The existing single-instance request
limiter uses the account ID for these routes. Responses use `private, no-store`.

## Testing with Scalar

Sign in to the portal, then open `/api-reference` on the **portal origin**
(locally http://localhost:3000/api-reference). Choose the same-origin `/v1`
server and a Platform operation. The browser supplies the HttpOnly session
cookie; do not copy session tokens into forms or source code. The portal proxies
platform requests to NestJS, preserving Origin for CSRF protection.

The API's own `/docs` and `/swagger` still expose the same contract. Opening
them on another origin does not grant that origin permission to mutate platform
data. Use the API-origin documentation and an API key to test NLP operations;
only platform routes are forwarded by the portal's `/v1/platform` rewrite.

## Verification and scope

`pnpm check` includes the platform HTTP security suite and web transport tests.
Set `MYANLEX_TEST_DATABASE_URL` to a migrated **disposable** PostgreSQL database
to run real onboarding, rollback, dynamic permission and tenant-isolation tests.
Never point it at production. CI supplies its own PostgreSQL service.

The initial role's display name is Owner. Authorization uses permission rows,
not that name. The permission catalog is shared by seeding and new-organization
creation; adding a capability does not retroactively grant it to existing roles.
This milestone does not expose invitations, role editing, project deletion,
usage reporting, plans or billing. Those remain separate milestones.

## Scoped API keys

Select a project on Projects or use the workspace/project selectors on API keys.
Create a named key, choose an expiration and save the secret immediately in a
secret manager. Closing the reveal dialog discards its in-memory plaintext;
there is no recovery endpoint. Copying places the secret on your system
clipboard, so clear that clipboard after saving it securely. Do not put keys in
browser code.

Under `/:organizationId/projects/:projectId/api-keys`, GET lists metadata, POST
creates a key, and POST `/:keyId/revoke` irreversibly revokes it. The project
itself can be read with GET `/:organizationId/projects/:projectId`
(`project.read`). Keys use the same cursor pagination as projects. Revoked and
expired keys remain visible, and repeat revocations return the original
timestamp. All operations are documented in the session-enabled Scalar
reference.

The creating member needs both `api_key.create` and `api.invoke`. Only
`api.invoke` is currently delegable; workspace administration remains
session-only. Read and revoke use `api_key.read` and `api_key.revoke`,
respectively. The console also needs `project.read` for project selection.
Existing roles without the grants are not automatically elevated.

The console uses the official shadcn Base UI sidebar with icon-collapse, a
mobile drawer and keyboard navigation. Workspace/project context is carried in
URLs; changing workspaces clears project selection. Reporting screens do not
fabricate usage totals. See
[the API-key decision](decisions/0009-scoped-api-keys.md) for credential
lifecycle and security details.
