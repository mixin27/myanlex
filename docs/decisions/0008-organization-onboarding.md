# ADR 0008: Organization onboarding and project control plane

## Status

Accepted

## Decision

Expose session-only `/v1/platform` routes separately from NLP bearer-key routes.
Every request validates a verified Better Auth session against storage. Unsafe
methods require the exact configured portal Origin. Responses are private and
no-store. API keys, including the bootstrap key, cannot authorize these routes.
The initial single-instance request limiter also limits platform users.

Any verified user can create an organization. Creation atomically inserts the
organization, an initial role named Owner, its explicit permission grants, and
the creator's membership. Owner is display data, never an authorization
shortcut. The permission catalog is shared with seeding. Existing organizations
do not automatically gain newly introduced permissions. No subscription is
promised or created in this milestone.

Membership permits discovering an organization and one's effective permissions.
Project listing, creation and updates require project.read, project.create and
project.update respectively. Checks are fresh on every operation. Non-members
receive 404; members without permission receive 403. Updates constrain both
project ID and organization ID. Clients cannot supply ownership or role fields.
The initial role is not a global administrator.

Organization slugs are globally unique; project slugs are unique per
organization. Conflicts return 409. Slugs use lowercase ASCII letters/digits
separated by single hyphens; names may use Myanmar or other Unicode text. Lists
use UUID keyset pagination (25 items by default, maximum 100); cursors are
exclusive IDs, not authorization tokens. New writes may require refreshing from
the first page.

Controllers, session transport guards and feature services live in Nest modules;
Prisma repositories live in infrastructure. The language core and NLP
application services remain untouched. The checked-in OpenAPI contract includes
the platform routes and is served in Swagger and Scalar.

The portal uses same-origin rewrites for mutations and authenticated server
reads. Organization selection is URL state, not an authorization claim. API-key
issuance, invitations, custom-role editing, billing and usage reporting remain
later work.
