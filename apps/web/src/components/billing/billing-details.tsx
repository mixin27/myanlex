'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import type {
  BillingDetails,
  BillingEmail,
  BillingProfile,
} from '@/lib/platform-types';
import { writePlatform } from '@/lib/platform-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export const MAX_BILLING_EMAILS = 3;

const statusLabel: Record<BillingEmail['status'], string> = {
  confirmed: 'Confirmed',
  pending: 'Waiting for confirmation',
  expired: 'Link expired',
};

/**
 * Bill-to details and billing emails (ADR 0026, "Billing details"). Members
 * with billing.read see them; billing.manage can edit.
 */
export function BillingDetailsCard({
  organizationId,
  organizationName,
  profile,
  canManage,
}: {
  organizationId: string;
  organizationName: string;
  profile: BillingProfile;
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const base = `organizations/${organizationId}/billing`;
  const confirmed = profile.emails.some((row) => row.status === 'confirmed');
  const hasDetails = Boolean(
    profile.legalName ||
    profile.address ||
    profile.taxId ||
    profile.invoiceNote,
  );

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError('');
    try {
      await action();
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Something went wrong.',
      );
    } finally {
      setBusy(null);
    }
  }

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    void run('add', async () => {
      const result = await writePlatform<{ email: string; delivery: string }>(
        `${base}/emails`,
        'POST',
        { email },
      );
      setEmail('');
      if (result.delivery === 'sent')
        toast.success(`We sent a confirmation link to ${result.email}.`);
      else
        toast.warning(
          `${result.email} was added, but the confirmation email could not be sent. Try Resend later.`,
        );
    });
  };

  return (
    <section
      aria-labelledby="billing-details-heading"
      className="space-y-4 rounded-xl border bg-white p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="billing-details-heading" className="font-semibold">
            Billing details
          </h2>
          <p className="text-sm text-muted-foreground">
            Printed on invoices issued after you change them. Invoices already
            issued keep the details they were issued with.
          </p>
        </div>
        {canManage && (
          <EditDetailsButton
            organizationId={organizationId}
            details={profile}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Bill to
          </h3>
          <BillToBlock
            name={profile.legalName ?? organizationName}
            address={profile.address}
            taxId={profile.taxId}
            note={profile.invoiceNote}
          />
          {!hasDetails && (
            <p className="mt-1 text-xs text-muted-foreground">
              Invoices show the workspace name until you add a legal name.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Billing emails
          </h3>
          {profile.emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="space-y-2">
              {profile.emails.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="font-medium break-all">{row.email}</span>
                  <Badge
                    variant={
                      row.status === 'confirmed'
                        ? 'secondary'
                        : row.status === 'expired'
                          ? 'destructive'
                          : 'outline'
                    }
                  >
                    {statusLabel[row.status]}
                  </Badge>
                  {canManage && row.status !== 'confirmed' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() =>
                        run(`resend-${row.id}`, async () => {
                          await writePlatform(
                            `${base}/emails/${row.id}/resend`,
                            'POST',
                          );
                          toast.success(
                            `We sent a new confirmation link to ${row.email}.`,
                          );
                        })
                      }
                    >
                      {busy === `resend-${row.id}` ? 'Sending…' : 'Resend'}
                    </Button>
                  )}
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${row.email}`}
                      disabled={busy !== null}
                      onClick={() =>
                        run(`remove-${row.id}`, () =>
                          writePlatform(`${base}/emails/${row.id}`, 'DELETE'),
                        )
                      }
                    >
                      {busy === `remove-${row.id}` ? 'Removing…' : 'Remove'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            {confirmed
              ? 'Invoices, reminders and receipts go to the confirmed addresses.'
              : 'Until an address is confirmed, invoices go to members who can manage billing.'}
          </p>
          {canManage && profile.emails.length < MAX_BILLING_EMAILS && (
            <form onSubmit={add} className="flex gap-2">
              <Input
                type="email"
                required
                maxLength={320}
                placeholder="finance@example.com"
                aria-label="Billing email address"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={busy !== null}
              >
                {busy === 'add' ? 'Adding…' : 'Add'}
              </Button>
            </form>
          )}
          {canManage && profile.emails.length >= MAX_BILLING_EMAILS && (
            <p className="text-xs text-muted-foreground">
              A workspace can have {MAX_BILLING_EMAILS} billing emails. Remove
              one to add another.
            </p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** The bill-to block, shared by the Billing page and the invoice page. */
export function BillToBlock({
  name,
  address,
  taxId,
  note,
}: {
  name: string;
  address: string | null;
  taxId: string | null;
  note: string | null;
}) {
  return (
    <address className="mt-1 text-sm not-italic">
      <span className="block font-medium">{name}</span>
      {address && (
        <span className="block whitespace-pre-line text-muted-foreground">
          {address}
        </span>
      )}
      {taxId && (
        <span className="block text-muted-foreground">Tax ID: {taxId}</span>
      )}
      {note && (
        <span className="block text-muted-foreground">Reference: {note}</span>
      )}
    </address>
  );
}

function EditDetailsButton({
  organizationId,
  details,
}: {
  organizationId: string;
  details: BillingDetails;
}) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({
    legalName: details.legalName ?? '',
    address: details.address ?? '',
    taxId: details.taxId ?? '',
    invoiceNote: details.invoiceNote ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await writePlatform(
        `organizations/${organizationId}/billing/profile`,
        'PUT',
        values,
      );
      setOpen(false);
      toast.success('Billing details saved.');
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save.');
    } finally {
      setBusy(false);
    }
  }

  const field = (
    key: keyof typeof values,
    label: string,
    hint: string,
    max: number,
    multiline = false,
  ) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={`${id}-${key}`}
          rows={3}
          maxLength={max}
          value={values[key]}
          onChange={(event) =>
            setValues({ ...values, [key]: event.target.value })
          }
          className="w-full rounded-lg border border-input px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      ) : (
        <Input
          id={`${id}-${key}`}
          maxLength={max}
          value={values[key]}
          onChange={(event) =>
            setValues({ ...values, [key]: event.target.value })
          }
        />
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit details
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Billing details</DialogTitle>
            <DialogDescription>
              Used on invoices issued from now on. Leave a field empty to omit
              it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {field(
              'legalName',
              'Legal name',
              'The company name to bill. Defaults to the workspace name.',
              200,
            )}
            {field('address', 'Address', 'Printed as written.', 500, true)}
            {field(
              'taxId',
              'Tax ID',
              'For example your TIN or VAT number.',
              64,
            )}
            {field(
              'invoiceNote',
              'Invoice note',
              'A purchase order number or reference printed on every invoice.',
              500,
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
