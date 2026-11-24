import type { Metadata } from 'next';
import { ConfirmBillingEmailButton } from '@/components/billing/confirm-billing-email';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// The token is in the URL; never leak it to other origins via Referer.
export const metadata: Metadata = {
  title: 'Confirm billing email',
  referrer: 'no-referrer',
};

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

/**
 * Opened from a billing-email confirmation link. No sign-in: whoever holds
 * the mailbox confirms. Nothing happens until the button is pressed, so link
 * scanners that open the URL do not confirm the address.
 */
export default async function ConfirmBillingEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token !== undefined && tokenPattern.test(token);
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {valid ? 'Confirm billing email' : 'Confirmation link invalid'}
          </CardTitle>
          <CardDescription>
            {valid
              ? 'A MyanLex workspace asked to send its invoices and payment receipts to this email address.'
              : 'This link is incomplete. Open the full link from your email, or ask the workspace for a new one.'}
          </CardDescription>
        </CardHeader>
        {valid && (
          <CardContent>
            <ConfirmBillingEmailButton token={token} />
          </CardContent>
        )}
      </Card>
    </main>
  );
}
