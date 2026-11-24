'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { writePlatform } from '@/lib/platform-client';

/** Confirms a billing email by its emailed token. */
export function ConfirmBillingEmailButton({ token }: { token: string }) {
  const [state, setState] = useState<
    | { kind: 'idle' | 'busy' }
    | { kind: 'done'; workspace: string; email: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  async function confirm() {
    setState({ kind: 'busy' });
    try {
      const result = await writePlatform<{ workspace: string; email: string }>(
        'billing-emails/confirm',
        'POST',
        { token },
      );
      setState({ kind: 'done', ...result });
    } catch (cause) {
      setState({
        kind: 'error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Unable to confirm this address.',
      });
    }
  }

  if (state.kind === 'done')
    return (
      <p role="status" className="text-sm">
        Confirmed. Invoices and receipts for{' '}
        <span className="font-medium">{state.workspace}</span> will be sent to{' '}
        <span className="font-medium">{state.email}</span>. You can close this
        page.
      </p>
    );
  return (
    <div className="space-y-3">
      <Button disabled={state.kind === 'busy'} onClick={confirm}>
        {state.kind === 'busy' ? 'Confirming…' : 'Confirm this address'}
      </Button>
      {state.kind === 'error' && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        If you did not expect this, close this page and nothing will be sent to
        you.
      </p>
    </div>
  );
}
