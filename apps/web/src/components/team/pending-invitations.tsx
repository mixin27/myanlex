import { Mail } from 'lucide-react';
import { readPlatform } from '@/lib/platform-server';
import type { PendingInvitation } from '@/lib/platform-types';
import { AcceptInvitationButton } from '@/components/team/accept-invitation';

/** Invitations addressed to the signed-in email; renders nothing when none. */
export async function PendingInvitations() {
  const { items } = await readPlatform<{ items: PendingInvitation[] }>(
    'invitations',
  );
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="pending-invitations"
      className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5"
    >
      <h2
        id="pending-invitations"
        className="flex items-center gap-2 font-semibold"
      >
        <Mail className="size-4" />
        Pending invitations
      </h2>
      <ul className="mt-4 divide-y">
        {items.map((invitation) => (
          <li
            key={invitation.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <div>
              <p className="font-medium">{invitation.organization.name}</p>
              <p className="text-xs text-muted-foreground">
                Role: {invitation.role.name} · Expires{' '}
                {invitation.expiresAt.slice(0, 10)} (UTC)
              </p>
            </div>
            <AcceptInvitationButton
              invitationId={invitation.id}
              label="Accept"
              size="sm"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
