'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { AcceptedInvitation } from '@/lib/platform-types';
import { writePlatform } from '@/lib/platform-client';

/**
 * Accepts by emailed token or by invitation id from the pending list. The API
 * checks that the invitation was addressed to the signed-in email.
 */
export function AcceptInvitationButton({
  token,
  invitationId,
  label = 'Accept invitation',
  size,
}: {
  token?: string;
  invitationId?: string;
  label?: string;
  size?: 'sm' | 'default';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function accept() {
    setBusy(true);
    setError('');
    try {
      const result = await writePlatform<AcceptedInvitation>(
        'invitations/accept',
        'POST',
        token ? { token } : { invitationId },
      );
      toast.success(
        result.status === 'accepted'
          ? `You joined ${result.organization.name}.`
          : `You are already a member of ${result.organization.name}.`,
      );
      router.replace(`/team?organization=${result.organization.id}`);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to accept invitation.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button disabled={busy} size={size} onClick={accept}>
        {busy ? 'Accepting…' : label}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
