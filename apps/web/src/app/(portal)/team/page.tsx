import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { readPlatform } from '@/lib/platform-server';
import { requireSession } from '@/lib/auth-server';
import type {
  AuditEventPage,
  Invitation,
  Member,
  Organization,
  OrganizationAccess,
  Page,
  Permission,
  Role,
} from '@/lib/platform-types';
import { OrganizationPicker } from '@/components/workspace/organization-picker';
import { TeamManager } from '@/components/team/team-manager';
import { buttonVariants } from '@/components/ui/button';

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    organization?: string;
    organizationsAfter?: string;
    membersAfter?: string;
  }>;
}) {
  const params = await searchParams;
  for (const value of Object.values(params))
    if (value !== undefined && !z.uuid().safeParse(value).success) notFound();
  const session = await requireSession();
  const organizations = await readPlatform<Page<Organization>>(
    `organizations${params.organizationsAfter ? `?after=${params.organizationsAfter}` : ''}`,
  );
  const organizationId = params.organization ?? organizations.items[0]?.id;
  const organization = organizationId
    ? await readPlatform<OrganizationAccess>(`organizations/${organizationId}`)
    : null;
  const choices =
    organization &&
    !organizations.items.some((item) => item.id === organization.id)
      ? [organization, ...organizations.items]
      : organizations.items;
  const can = (permission: string) =>
    organization?.permissions.includes(permission) ?? false;
  const base = organization ? `organizations/${organization.id}` : '';
  // Only fetch what the member's current role allows; the API enforces it too.
  const [members, invitations, roles, permissions, audit] = await Promise.all([
    can('member.read')
      ? readPlatform<Page<Member>>(
          `${base}/members${params.membersAfter ? `?after=${params.membersAfter}` : ''}`,
        )
      : null,
    can('member.read')
      ? readPlatform<Page<Invitation>>(`${base}/invitations?limit=100`)
      : null,
    can('role.read') ? readPlatform<{ items: Role[] }>(`${base}/roles`) : null,
    can('role.read')
      ? readPlatform<{ items: Permission[] }>(`${base}/permissions`)
      : null,
    can('audit.read')
      ? readPlatform<AuditEventPage>(`${base}/audit-events?limit=50`)
      : null,
  ]);
  return (
    <div className="space-y-6">
      <header className="page-heading">
        <h1>Team</h1>
        <p>Invite people, assign roles, and decide what each role can do.</p>
      </header>
      {choices.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <OrganizationPicker
            organizations={choices}
            selected={organizationId}
          />
        </div>
      )}
      {(organizations.nextCursor || params.organizationsAfter) && (
        <nav
          aria-label="Workspace pages"
          className="flex flex-wrap gap-4 text-xs underline"
        >
          {organizations.nextCursor && (
            <Link href={`/team?organizationsAfter=${organizations.nextCursor}`}>
              More workspaces
            </Link>
          )}
          {params.organizationsAfter && (
            <Link href="/team">First workspaces</Link>
          )}
        </nav>
      )}
      {organization && (members || roles || audit) ? (
        <>
          <TeamManager
            key={organization.id}
            organizationId={organization.id}
            organizationSlug={organization.slug}
            currentUserId={session.user.id}
            permissions={organization.permissions}
            members={members?.items ?? null}
            invitations={invitations?.items ?? null}
            roles={roles?.items ?? null}
            catalog={permissions?.items ?? []}
            audit={audit}
          />
          {(members?.nextCursor || params.membersAfter) && (
            <nav
              aria-label="Member pages"
              className="flex gap-4 text-sm underline"
            >
              {params.membersAfter && (
                <Link href={`/team?organization=${organization.id}`}>
                  First members
                </Link>
              )}
              {members?.nextCursor && (
                <Link
                  href={`/team?organization=${organization.id}&membersAfter=${members.nextCursor}`}
                >
                  Next members
                </Link>
              )}
            </nav>
          )}
        </>
      ) : (
        <section className="rounded-xl border bg-white p-8">
          <h2 className="font-semibold">
            {organization ? 'Access restricted' : 'Start with a workspace'}
          </h2>
          <p className="my-3 text-sm text-muted-foreground">
            {organization
              ? 'Your role needs member.read, role.read or audit.read to view this team.'
              : 'Create a workspace to invite teammates and manage roles.'}
          </p>
          <Link
            className={buttonVariants({ variant: 'outline' })}
            href={
              organization
                ? `/projects?organization=${organization.id}`
                : '/projects'
            }
          >
            Open projects
          </Link>
        </section>
      )}
    </div>
  );
}
