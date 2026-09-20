'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DataTable, type DataTableFeatures } from '@/components/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import type { ApiKey } from '@/lib/platform-types';
import { writePlatform } from '@/lib/platform-client';

export function ApiKeyManager({
  organizationId,
  projectId,
  keys,
  permissions,
}: {
  organizationId: string;
  projectId: string;
  keys: ApiKey[];
  permissions: string[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = `organizations/${organizationId}/projects/${projectId}/api-keys`;
  const fail = (cause: unknown) => {
    const message =
      cause instanceof Error
        ? cause.message
        : 'Unable to complete this request.';
    setError(message);
    toast.error(message);
  };
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const days = Number(data.get('expiry'));
    try {
      const result = await writePlatform<ApiKey & { secret: string }>(
        path,
        'POST',
        {
          name: data.get('name'),
          scopes: ['api.invoke'],
          ...(days
            ? {
                expiresAt: new Date(Date.now() + days * 86400000).toISOString(),
              }
            : {}),
        },
      );
      setSecret(result.secret);
      setCreating(false);
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!revoking) return;
    setBusy(true);
    setError('');
    try {
      await writePlatform<ApiKey>(`${path}/${revoking.id}/revoke`, 'POST', {});
      setRevoking(null);
      toast.success('API key revoked.');
      router.refresh();
    } catch (cause) {
      fail(cause);
    } finally {
      setBusy(false);
    }
  }
  const columns: ColumnDef<DataTableFeatures, ApiKey>[] = [
    {
      accessorKey: 'name',
      header: 'Key',
      cell: ({ row }) => (
        <div className="py-2">
          <p className="font-medium">{row.original.name}</p>
          <code className="text-xs text-muted-foreground">
            {row.original.prefix}••••
          </code>
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.revokedAt ? 'secondary' : 'outline'}>
          {row.original.revokedAt
            ? 'Revoked'
            : row.original.expiresAt &&
                Date.parse(row.original.expiresAt) <= Date.now()
              ? 'Expired'
              : 'Active'}
        </Badge>
      ),
    },
    {
      id: 'scopes',
      header: 'Scopes',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.scopes.join(', ')}
        </span>
      ),
    },
    {
      id: 'lastUsedAt',
      header: 'Last used (UTC)',
      cell: ({ row }) =>
        row.original.lastUsedAt
          ? row.original.lastUsedAt.slice(0, 16).replace('T', ' ')
          : 'Never',
    },
    {
      id: 'expiresAt',
      header: 'Expires (UTC)',
      cell: ({ row }) =>
        row.original.expiresAt?.slice(0, 10) ?? 'No expiration',
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        permissions.includes('api_key.revoke') && !row.original.revokedAt ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => {
              setError('');
              setRevoking(row.original);
            }}
          >
            Revoke<span className="sr-only"> {row.original.name}</span>
          </Button>
        ) : null,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Project credentials</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Keys are scoped to this project. Keep them on your server.
          </p>
        </div>
        {permissions.includes('api_key.create') &&
          permissions.includes('api.invoke') && (
            <Button
              onClick={() => {
                setError('');
                setCreating(true);
              }}
            >
              <Plus className="size-4" />
              Create API key
            </Button>
          )}
      </div>
      <div className="overflow-hidden rounded-xl bg-white">
        <DataTable
          data={keys}
          columns={columns}
          emptyMessage="No API keys in this page. Create a key to connect your application."
        />
      </div>
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        Secrets are shown once. Revoked keys cannot be restored; create a
        replacement to rotate credentials.
      </p>
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!busy) setCreating(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Grant your application access to this project only.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={create} className="space-y-5">
            <label className="grid gap-2 text-sm font-medium">
              Key name
              <Input
                name="name"
                required
                maxLength={120}
                placeholder="e.g. Production server"
                disabled={busy}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Expiration
              <select
                name="expiry"
                defaultValue="90"
                disabled={busy}
                className="h-9 rounded-md border bg-background px-3"
              >
                <option value="30">30 days</option>
                <option value="90">90 days (recommended)</option>
                <option value="365">1 year</option>
                <option value="0">No expiration</option>
              </select>
            </label>
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4" />
                Invoke language API
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                <code>api.invoke</code> — language-processing requests only. No
                account, workspace, or role administration.
              </p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button disabled={busy} type="submit" className="w-full">
              {busy ? 'Creating…' : 'Create key'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={secret !== null}
        onOpenChange={(open) => {
          if (!open) setSecret(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new API key</DialogTitle>
            <DialogDescription>
              This is the only time the full key will be shown. Save it in your
              secret manager before closing.
            </DialogDescription>
          </DialogHeader>
          <code className="break-all rounded-lg border bg-muted p-4 text-sm select-all">
            {secret}
          </code>
          <Button
            onClick={async () => {
              if (!secret) return;
              try {
                await navigator.clipboard.writeText(secret);
                toast.success('API key copied.');
              } catch {
                toast.error(
                  'Clipboard unavailable. Select and copy the key manually.',
                );
              }
            }}
          >
            <Copy className="size-4" />
            Copy key
          </Button>
          <Button variant="outline" onClick={() => setSecret(null)}>
            I have saved my key
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!busy && !open) setRevoking(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke {revoking?.name}?</DialogTitle>
            <DialogDescription>
              New requests using this key will be rejected immediately.
              Applications using it will need a replacement key. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setRevoking(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={revoke}>
              {busy ? 'Revoking…' : 'Revoke key'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
