'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { ChangePreview, PlanChange } from '@/lib/platform-types';
import { formatMoney } from '@/lib/money';
import { writePlatform } from '@/lib/platform-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * Requests a plan through the approval channel. A future checkout channel
 * can swap this button's action by the plan's change policy.
 */
export function RequestPlanButton({
  organizationId,
  plan,
  nextMonthStart,
  change,
  label = 'Request this plan',
}: {
  organizationId: string;
  plan: { slug: string; name: string };
  /** ISO start of next month (UTC), from the API's clock. */
  nextMonthStart: string;
  /** How the change is billed: only upgrades can start before the 1st. */
  change: ChangePreview;
  label?: string;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [timing, setTiming] = useState<'now' | 'next_month'>('next_month');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await writePlatform(
        `organizations/${organizationId}/billing/plan-changes`,
        'POST',
        { planSlug: plan.slug, timing, ...(note.trim() ? { note } : {}) },
      );
      setOpen(false);
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to send the request.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request the {plan.name} plan</DialogTitle>
            <DialogDescription>
              The MyanLex team reviews plan changes and emails you when it’s
              decided. Base fees are billed in advance each month; overage is
              billed after the month closes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-5">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Start</legend>
              {(
                [
                  [
                    'next_month',
                    `From ${day(nextMonthStart)}`,
                    `Invoiced with your monthly invoice on ${day(nextMonthStart)}.`,
                  ],
                  ...(change.nowAllowed
                    ? ([
                        [
                          'now',
                          'When approved',
                          change.prorationMinor
                            ? `You’ll be invoiced about ${formatMoney(change.prorationMinor, change.currency)} for the rest of this month (the exact amount depends on the approval day).`
                            : 'Nothing extra is invoiced this month.',
                        ],
                      ] as const)
                    : []),
                ] as const
              ).map(([value, title, hint]) => (
                <label
                  key={value}
                  className="flex cursor-pointer gap-3 rounded-lg border p-3 text-sm has-checked:border-emerald-700"
                >
                  <input
                    type="radio"
                    name={`${id}-timing`}
                    value={value}
                    checked={timing === value}
                    onChange={() => setTiming(value)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{title}</span>
                    <span className="block text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
              {!change.nowAllowed && (
                <p className="text-xs text-muted-foreground">
                  {change.kind === 'currency'
                    ? 'A change of currency starts on the 1st of a month.'
                    : 'Downgrades and moves to Free start on the 1st of next month; the current month is already paid.'}
                </p>
              )}
            </fieldset>
            <label className="grid gap-1 text-sm font-medium">
              Note for the MyanLex team (optional)
              <textarea
                value={note}
                maxLength={500}
                rows={3}
                onChange={(event) => setNote(event.target.value)}
                className="rounded-md border bg-background p-2 text-sm font-normal"
                placeholder="Purchase order number, billing contact…"
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-red-700">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Send request'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The workspace's open change, with Cancel for members who can manage billing. */
export function OpenChangeBanner({
  organizationId,
  change,
  canManage,
}: {
  organizationId: string;
  change: PlanChange;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await writePlatform(
        `organizations/${organizationId}/billing/plan-changes/${change.id}/cancel`,
        'POST',
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Unable to cancel the request.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      role="status"
      aria-label="Plan change waiting for review"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p>
        <span className="font-medium">
          Waiting for review: move to {change.plan.name}
        </span>{' '}
        ·{' '}
        {change.requestedStartsAt
          ? `from ${day(change.requestedStartsAt)}`
          : 'when approved'}{' '}
        · requested by {change.requesterEmail} on {day(change.createdAt)}
      </p>
      {canManage && (
        <Button variant="outline" size="sm" disabled={busy} onClick={cancel}>
          {busy ? 'Cancelling…' : 'Cancel request'}
        </Button>
      )}
      {error && (
        <p role="alert" className="w-full text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
