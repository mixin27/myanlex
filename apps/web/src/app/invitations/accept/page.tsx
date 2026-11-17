import type { Metadata } from 'next';
import Link from 'next/link';
import { getSession } from '@/lib/auth-server';
import { AcceptInvitationButton } from '@/components/team/accept-invitation';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// The token is in the URL; never leak it to other origins via Referer.
export const metadata: Metadata = {
  title: 'Accept invitation · MyanLex',
  referrer: 'no-referrer',
};

const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/;

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token !== undefined && tokenPattern.test(token);
  const session = valid ? await getSession() : null;
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {valid ? 'Join a MyanLex workspace' : 'Invitation link invalid'}
          </CardTitle>
          <CardDescription>
            {!valid
              ? 'This link is incomplete. Open the full link from your email, or ask for a new invitation.'
              : session
                ? `You are signed in as ${session.user.email}. The invitation must have been sent to this address.`
                : 'Sign in, or create an account, with the email address this invitation was sent to.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {valid && session && <AcceptInvitationButton token={token} />}
          {valid && !session && (
            <>
              <div className="flex flex-wrap gap-2">
                <Link href="/login" className={buttonVariants()}>
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className={buttonVariants({ variant: 'outline' })}
                >
                  Create account
                </Link>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                After you sign in, the invitation appears on your dashboard. You
                can also return to this link.
              </p>
            </>
          )}
          {(!valid || session) && (
            <Link href="/dashboard" className="block text-sm underline">
              Go to dashboard
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
