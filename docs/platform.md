# Developer console, organizations, projects, API keys and teams

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

Organization allowance reporting is available at
`GET /v1/platform/organizations/:organizationId/quota` for verified member
sessions with `usage.read`. It powers the dashboard's Monthly allowance panel,
separate from project activity analytics. See
[quota reporting](decisions/0012-quota-reporting.md) and
[quota semantics](limits.md).

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
not that name. Owner is a system role: `pnpm db:seed` grants it any permission
added to the catalog later, and it cannot be edited or deleted. Custom roles are
never elevated automatically. Project deletion, plans and billing remain
separate milestones.

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

## Usage reporting

Open Usage, choose a workspace and project, then choose an inclusive UTC date
range (maximum 90 days). The default is the last 30 days including today. The
overview shows today's recorded activity for the selected project, or the first
project in the selected workspace when none is selected. Its report link
preserves that context.

The UI displays request/error totals, submitted characters (Unicode code
points), average handler duration, daily charts and an expandable exact-value
table. Missing days are zero-filled. Today is partial; apply the range again to
refresh. Invalid dates produce validation feedback, not fabricated zero totals.
Workspace and project selectors retain pagination for larger accounts.

GET `/:organizationId/projects/:projectId/usage?from=2026-01-01&to=2026-01-31`
requires `usage.read` and a verified account session. Both dates are optional
only as a pair, cannot be in the future, and must be on or after 1970-01-01. The
console also requires `project.read` for selection. Test this operation in
Scalar using the portal's session-enabled `/api-reference`.

Reports query recorded events in one parameterized aggregate; they do not modify
the database or depend on a scheduled rollup. Integer counters are JSON decimal
strings to avoid precision loss. No migration or additional dependency is
needed.

Metering is **best-effort**, not billing-grade: bootstrap keys, pre-handler
rejections (including rate limits), and events lost to persistence failure or
process exit are not represented. Successful batch responses with individual
item failures do not increase the HTTP error count. Character totals describe
submitted text lengths, not guaranteed successful processing. Text is never
stored in usage events. Historical activity remains after a key is revoked.

See [the reporting decision](decisions/0010-usage-reporting.md) for metric
definitions and UTC semantics. Monthly quota reservations are separate from
these best-effort reports: they count admitted requests before handler
execution, not completed usage events. See [rate limits and quotas](limits.md)
for configuration, rollout, and operational semantics. Durable billing metering
remains future work.

## Team management

Open **Team**, choose a workspace, and use the Members, Invitations and Roles
tabs. Apply the `20261118000000_team_management` migration and rerun
`pnpm db:seed` before using it. See
[the team-management decision](decisions/0021-team-management.md) for the
security rules.

1. **Roles** (`role.read` to view, `role.manage` to change):
   - Create a custom role with a name, slug, optional description and
     permissions.
   - Permissions you do not hold are disabled, and the API rejects them.
   - The system Owner role cannot be changed.
   - A role cannot be deleted while members or open invitations use it.
2. **Invite** (`member.manage`, plus `role.read` for role selection): enter an
   email address and a role.
   - The invitee receives a seven-day, single-use link at `/invitations/accept`.
   - The invitation also appears in a **Pending invitations** card on the
     invitee's dashboard once they sign in with that address.
   - If SMTP fails or is not configured, the invitation is still created and the
     console says the email was not sent.
3. **Members** (`member.read` to view, `member.manage` to change):
   - Change roles or remove members.
   - Anyone can leave a workspace.
   - Any change that would leave no member holding both `member.manage` and
     `role.manage` is rejected with 409.
   - You cannot assign, change or remove a role or member that has permissions
     you do not hold.

All routes are under `/v1/platform/organizations/:organizationId` unless noted:

| Method | Suffix                            | Permission and notes                                |
| ------ | --------------------------------- | --------------------------------------------------- |
| GET    | /members                          | member.read; cursor by user ID                      |
| PATCH  | /members/:userId                  | member.manage; `{ roleId }`; escalation/last guard  |
| DELETE | /members/:userId                  | member.manage, or yourself to leave; 204            |
| GET    | /permissions                      | role.read; assignable permission catalog            |
| GET    | /roles                            | role.read; permissions, member and invite counts    |
| POST   | /roles                            | role.manage; `{ name, slug, description?, perms }`  |
| PATCH  | /roles/:roleId                    | role.manage; partial; system roles return 409       |
| DELETE | /roles/:roleId                    | role.manage; 409 while in use; 204                  |
| GET    | /invitations                      | member.read; open (pending or expired) invitations  |
| POST   | /invitations                      | member.manage; `{ email, roleId }`; `emailDelivery` |
| POST   | /invitations/:invitationId/resend | member.manage; rotates the link and expiry          |
| POST   | /invitations/:invitationId/revoke | member.manage; idempotent                           |
| GET    | `/v1/platform/invitations`        | Your pending invitations (any verified session)     |
| POST   | `/v1/platform/invitations/accept` | `{ token }` or `{ invitationId }`; 410 when closed  |

To test invitations locally:

1. Sign in as the owner, invite a second address, and open the link from Mailpit
   in a separate browser profile.
2. Register and verify that address, then accept the invitation.
3. Try every route in the session-enabled Scalar reference at the portal's
   `/api-reference`.

Invitation tokens never appear in API responses, and only their SHA-256 hashes
are stored.

## Audit log and ownership transfer

Apply the `20261119000000_audit_events` migration. It grants the new
`audit.read` permission to Owner roles. See
[the audit decision](decisions/0022-audit-log-and-ownership-transfer.md) for the
rules.

- **Activity tab** (`audit.read`): **Team → Activity** lists every platform
  change in the workspace, newest first, each with:
  - the actor's email;
  - a readable sentence;
  - expandable details (action, target, request id, metadata).

  Filter by action, and use **Load older activity** to page.

- **Transfer ownership** (Owner role only): on the Members tab, an Owner sees
  **Transfer ownership** next to each member who is not already an Owner.
  - Pick the role you will move to. You need at least one non-Owner role.
  - Type the workspace slug to confirm.
  - The other member becomes Owner, and you get the role you picked, in one
    step.

| Method | Suffix              | Permission and notes                                               |
| ------ | ------------------- | ------------------------------------------------------------------ |
| GET    | /audit-events       | audit.read; `?limit=&cursor=&action=`; newest first                |
| POST   | /ownership-transfer | Owner role; `{ toUserId, newRoleId, confirmSlug }`; 409 if already |

Events are written in the same transaction as the change, so a rejected change
leaves no event. Events never contain API-key secrets or invitation tokens. To
remove events past the retention period (`MYANLEX_AUDIT_RETENTION_DAYS`, default
365, minimum 30), run this from cron, for example daily:

```sh
DATABASE_URL='<database connection>' pnpm audit:cleanup
```
