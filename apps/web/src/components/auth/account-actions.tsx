'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';

export function AccountActions({
  providers,
}: {
  providers: ('google' | 'github')[];
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function run(
    action: () => Promise<{ error?: { message?: string } | null }>,
    message: string,
  ) {
    setBusy(true);
    try {
      const result = await action();
      if (result.error)
        throw new Error(
          result.error.message ?? 'Unable to complete the request.',
        );
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Unable to complete the request.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        disabled={busy}
        onClick={() =>
          run(async () => {
            const result = await authClient.signOut();
            if (!result.error) {
              router.replace('/login');
              router.refresh();
            }
            return result;
          }, 'Signed out.')
        }
      >
        Sign out
      </Button>
      <Button
        variant="outline"
        disabled={busy}
        onClick={() =>
          run(
            () => authClient.revokeOtherSessions(),
            'Other sessions signed out.',
          )
        }
      >
        Sign out other devices
      </Button>
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(
              () =>
                authClient.linkSocial({ provider, callbackURL: '/account' }),
              'Continue with your provider to link your account.',
            )
          }
        >
          Link {provider === 'github' ? 'GitHub' : 'Google'}
        </Button>
      ))}
    </div>
  );
}
