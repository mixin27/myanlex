# 0021 — Team management: members, custom roles and invitations

Status: accepted.

Organizations need more than their creator. This decision adds member
management, custom roles and email invitations on top of dynamic RBAC
([0006](0006-dynamic-platform-authorization.md)). Authorization still checks
permission keys and never role names. Every route requires a verified cookie
session and keeps the trusted-Origin check for writes. A non-member gets 404 and
a member missing the permission gets 403.

## Roles

- Each organization's creator role, Owner, is now a **system role**
  (`roles.system`). A system role holds the full permission catalog and can't be
  edited or deleted.
- `pnpm db:seed` grants new catalog permissions to existing system roles. This
  closes the gap where permissions added later never reached Owner. Custom roles
  are never elevated automatically.
- Custom roles are organization-scoped rows with permission grants from the
  catalog. The `owner` slug is reserved.
- A role can be deleted only after no member and no open invitation uses it.
  Closed invitations that reference it are removed with it.

## No privilege escalation

An actor may only grant or take away permissions they already hold. This applies
to:

- creating a role or changing its permissions;
- editing or deleting a role at all, which requires the actor to hold every
  permission the role has;
- changing a member's role, which requires holding every permission of both the
  old and the new role;
- removing another member, which requires holding every permission that member
  has;
- inviting someone into a role, or resending that invitation.

This is the same delegation rule as API-key scopes in
[0009](0009-scoped-api-keys.md).

## An organization always stays manageable

Changing a member's role, removing a member, leaving, and editing a role's
permissions all run in one transaction. Each one:

1. locks the organization row (`SELECT … FOR UPDATE`),
2. applies the change,
3. checks that at least one member still holds both `member.manage` and
   `role.manage`. If not, it rolls back and returns 409.

Because of the lock, two concurrent demotions can't both succeed. The last
member therefore cannot leave, which also prevents orphaned organizations.

## Invitations

- **Token:** 32 random bytes in base64url. Only its SHA-256 hash is stored; the
  token appears only in the emailed link and is never returned by the API.
- **Lifetime:** invitations expire after seven days. Resending replaces the
  token, which invalidates the old link, and restarts the expiry. Revocation is
  idempotent.
- **One open invitation per address:** a partial unique index allows only one
  unaccepted, unrevoked invitation per organization and email. When a new
  invitation is created, any expired open one is closed first. Inviting someone
  who is already a member returns 409.
- **Email-bound acceptance:** an invitation can only be accepted by the account
  whose verified session email matches the invited address (compared in
  lowercase).
- **Two ways to accept:**
  - the emailed link (`token`);
  - the portal's pending list (`invitationId`). An id that belongs to someone
    else's invitation returns 404, the same as one that doesn't exist.
- **Single use:** a conditional update claims the invitation atomically.
  - expired, revoked or already-used: 410;
  - unknown token: 404;
  - already a member: success with `already_member`.
- **Email delivery is best effort:**
  - It uses the existing account SMTP transport.
  - It never logs recipients or content.
  - The response reports `emailDelivery` as `sent`, `failed` or `disabled`. The
    invitation exists either way, and the invitee still sees it on their
    dashboard.
  - Messages name only the organization, not the role.
- **Link handling:** the accept page uses `Referrer-Policy: no-referrer`.
  Signed-out visitors are sent to sign in. The invitation then appears on their
  dashboard, so no post-login redirect parameter is needed. That avoids
  open-redirect handling.

## Consequences

- One migration (`20261118000000_team_management`) adds `roles.system` and
  `organization_invitations`. It marks existing `owner` roles as system roles.
- `docs/platform.md` describes the routes, which are in `openapi/openapi.yaml`.
  They are tested with mocked repositories in `apps/api/test/team.test.ts` and
  against PostgreSQL in `team.postgres.test.ts`.
- Not included:
  - ownership transfer beyond assigning another member the Owner role;
  - admin audit records;
  - per-project roles;
  - invitation rate limits beyond the existing per-account request limiter.
