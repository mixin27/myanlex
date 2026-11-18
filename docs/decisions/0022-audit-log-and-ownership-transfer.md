# 0022 — Audit log and ownership transfer

Status: accepted.

Team management ([0021](0021-team-management.md)) lets several people change
each other's access. This decision records who changed what, and adds an
explicit way to hand over ownership.

## Audit log

- **Scope:** every platform write.
  - Workspace creation.
  - Project creation and updates.
  - API-key creation and revocation.
  - Member role changes, removals and leaving.
  - Role creation, updates and deletion.
  - Invitations sent, resent, revoked and accepted.
  - Ownership transfers.
- **Same transaction:** each event is written inside the database transaction
  that makes the change.
  - If the change rolls back, there is no event. That covers a last-manager 409,
    a duplicate slug, or any other error.
  - If the change commits, so does its event. Nothing is logged on a best-effort
    basis afterwards.
- **Only real changes:** no-ops write nothing. That includes revoking an
  already-closed invitation or an already-revoked key, a role PATCH that changes
  nothing, or assigning the role a member already has.
- **Append-only:**
  - The API has no update or delete routes.
  - A trigger rejects `UPDATE` on `audit_events`. The one exception is the
    foreign key's own `ON DELETE SET NULL` when the acting user is deleted.
  - Rows go away only with their organization or through retention cleanup.
- **Minimal data:**
  - Each event stores:
    - the actor's user id, set to NULL if the account is deleted;
    - an email snapshot;
    - the action and the target type and id;
    - the request id;
    - small action-specific metadata.
  - Metadata covers role names, permission diffs, changed project fields,
    invitee emails, and API-key names and prefixes.
  - No IP addresses or user agents.
  - Never key material, invitation tokens or token hashes.
- **Reading** requires the new `audit.read` permission. The migration grants it
  to system (Owner) roles, and `pnpm db:seed` keeps them in sync. Results are
  newest first, using an opaque `(createdAt, id)` keyset cursor, with an
  optional exact action filter.
- **Retention:**
  - `pnpm audit:cleanup` deletes events older than
    `MYANLEX_AUDIT_RETENTION_DAYS`, which defaults to 365 with a minimum of 30.
  - It deletes in batches of 500 using `FOR UPDATE SKIP LOCKED`.
  - Operators schedule it. The API does not run it.
  - Backups keep their own retention.

## Ownership transfer

`POST /v1/platform/organizations/:id/ownership-transfer` with
`{ toUserId, newRoleId, confirmSlug }`.

- **Who:** only a member whose current role is the system Owner role. This is
  checked through the `system` flag, not the role name, under the organization
  lock.
- **What:** in one transaction,
  - the target member receives the Owner role;
  - the actor moves to `newRoleId`, which must be a non-system role;
  - the last-manager guard runs;
  - `ownership.transferred` is recorded.
- **Confirmation:** `confirmSlug` must equal the organization slug.
- **Rejected:**
  - transferring to yourself;
  - a target that is already an Owner;
  - a non-member target.
- **Co-owners** stay allowed. Assigning the Owner role from the member list
  still works and is recorded as `member.role_changed`.

## Consequences

- One migration, `20261119000000_audit_events`, adds the table, the trigger and
  the `audit.read` grant.
- Every repository write takes an `AuditActor`, which is the session user id,
  their email and the request id.
- The routes are in `openapi/openapi.yaml`.
- Tests: `apps/api/test/audit.test.ts` (HTTP) and `audit.postgres.test.ts`
  (atomicity, no-ops, trigger, transfer races, cleanup).
- Not included:
  - export or streaming to an external system;
  - sign-in and session events, which Better Auth handles;
  - audit records for API-key usage, which are covered by usage reporting.
