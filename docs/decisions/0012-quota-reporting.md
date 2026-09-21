# ADR 0012: Read-only workspace quota visibility

Status: accepted.

The dashboard exposes organization-wide monthly reservations independently of
project activity reports. A verified member with dynamic `usage.read` permission
can read `GET /v1/platform/organizations/:organizationId/quota`; no project or
`project.read` permission is needed. API keys are not accepted. Membership is
checked before permission to preserve the existing 404 tenant boundary.

The repository shares the enforcement plan resolver and database clock. A
repeatable-read transaction takes a consistent plan/ledger snapshot without
inserting or consuming counters. Missing current-month rows mean zero recorded
reservations. Missing plans or ambiguous subscriptions are unavailable, never
invented Free or unlimited data. Reads work while enforcement is disabled.

Counters are decimal strings. Null limits and remaining values mean unlimited;
finite remaining values are clamped to zero on exhaustion or downgrade. The
response includes the UTC period, reset time, snapshot time, applicable plan
source, and serving instance's enforcement flag. HTTP and server-component reads
are uncached. No Redis authorization or report cache is added.

The dashboard distinguishes retained reservations while enforcement is off from
live usage. It labels reservations, scope, refresh behavior, and non-billing
semantics. Backend unavailability does not display fabricated counters; login
redirects and not-found signals remain intact. No payments, plan editing, or
subscription provisioning are included.

Automated HTTP, PostgreSQL, and rendered-markup tests verify access boundaries,
read-only behavior, disabled enforcement, exact arithmetic, and edge states.
Browser automation remains intentionally unused at the user's request.
