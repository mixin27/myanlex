'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Plus, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  Invitation,
  Member,
  Permission,
  Role,
  SentInvitation,
} from '@/lib/platform-types';
import { writePlatform } from '@/lib/platform-client';

const selectClass = 'h-9 rounded-md border bg-background px-3 text-sm';
const holdsAll = (actor: string[], granted: string[]) =>
  granted.every((permission) => actor.includes(permission));
const date = (value: string) => value.slice(0, 10);

type Confirm = {
  title: string;
  description: string;
  action: string;
  run: () => Promise<unknown>;
  success: string;
};

export function TeamManager({
  organizationId,
  currentUserId,
  permissions,
  members,
  invitations,
  roles,
  catalog,
}: {
  organizationId: string;
  currentUserId: string;
  permissions: string[];
  members: Member[] | null;
  invitations: Invitation[] | null;
  roles: Role[] | null;
  catalog: Permission[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const base = `organizations/${organizationId}`;
  const can = (permission: string) => permissions.includes(permission);
  // Mirrors the API's escalation rule so the UI only offers allowed choices.
  const assignable = (roles ?? []).filter((role) =>
    holdsAll(permissions, role.permissions),
  );

  async function perform<T>(
    operation: () => Promise<T>,
    success?: string,
  ): Promise<{ ok: true; value: T } | { ok: false }> {
    setBusy(true);
    setError('');
    try {
      const result = await operation();
      if (success) toast.success(success);
      router.refresh();
      return { ok: true, value: result };
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Unable to complete this request.';
      setError(message);
      toast.error(message);
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const outcome = await perform(() =>
      writePlatform<SentInvitation>(`${base}/invitations`, 'POST', {
        email: String(data.get('email') ?? '').trim(),
        roleId: data.get('roleId'),
      }),
    );
    if (!outcome.ok) return;
    const result = outcome.value;
    setInviting(false);
    toast.success(
      result.emailDelivery === 'sent'
        ? `Invitation sent to ${result.email}.`
        : `Invitation created. Email could not be sent; ${result.email} can accept it from their dashboard after signing in.`,
    );
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description') ?? '').trim();
    const body = {
      name: String(data.get('name') ?? '').trim(),
      slug: String(data.get('slug') ?? '').trim(),
      description: description || null,
      permissions: data.getAll('permissions').map(String),
    };
    const outcome = await perform(
      () =>
        editing === 'new'
          ? writePlatform<Role>(`${base}/roles`, 'POST', body)
          : writePlatform<Role>(
              `${base}/roles/${(editing as Role).id}`,
              'PATCH',
              body,
            ),
      editing === 'new' ? 'Role created.' : 'Role updated.',
    );
    if (outcome.ok) setEditing(null);
  }

  async function confirmAction() {
    if (!confirm) return;
    if ((await perform(confirm.run, confirm.success)).ok) setConfirm(null);
  }

  const groups = [...new Set(catalog.map(({ key }) => key.split('.')[0]))];
  const defaultTab = members ? 'members' : 'roles';
  return (
    <div className="space-y-4">
      {error && !inviting && !editing && !confirm && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {members && <TabsTrigger value="members">Members</TabsTrigger>}
          {invitations && (
            <TabsTrigger value="invitations">
              Invitations
              {invitations.length > 0 && ` (${invitations.length})`}
            </TabsTrigger>
          )}
          {roles && <TabsTrigger value="roles">Roles</TabsTrigger>}
        </TabsList>

        {members && (
          <TabsContent value="members" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Members</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Everyone with access to this workspace.
                </p>
              </div>
              {can('member.manage') && roles && (
                <Button
                  onClick={() => {
                    setError('');
                    setInviting(true);
                  }}
                >
                  <Mail className="size-4" />
                  Invite member
                </Button>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined (UTC)</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const self = member.userId === currentUserId;
                    const manageable =
                      can('member.manage') &&
                      holdsAll(permissions, member.permissions);
                    return (
                      <TableRow key={member.userId}>
                        <TableCell className="py-3">
                          <p className="font-medium">
                            {member.name}
                            {self && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (you)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {member.email}
                          </p>
                        </TableCell>
                        <TableCell>
                          {manageable && roles ? (
                            <select
                              aria-label={`Role for ${member.name}`}
                              className={selectClass}
                              value={member.role.id}
                              disabled={busy}
                              onChange={(event) => {
                                const roleId = event.target.value;
                                void perform(
                                  () =>
                                    writePlatform<Member>(
                                      `${base}/members/${member.userId}`,
                                      'PATCH',
                                      { roleId },
                                    ),
                                  `Role updated for ${member.name}.`,
                                );
                              }}
                            >
                              {!assignable.some(
                                (role) => role.id === member.role.id,
                              ) && (
                                <option value={member.role.id}>
                                  {member.role.name}
                                </option>
                              )}
                              {assignable.map((role) => (
                                <option key={role.id} value={role.id}>
                                  {role.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant="outline">{member.role.name}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{date(member.joinedAt)}</TableCell>
                        <TableCell className="text-right">
                          {(self || manageable) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                setError('');
                                setConfirm({
                                  title: self
                                    ? 'Leave this workspace?'
                                    : `Remove ${member.name}?`,
                                  description: self
                                    ? 'You will lose access immediately. Someone with member.manage must invite you again.'
                                    : `${member.email} will lose access to this workspace immediately.`,
                                  action: self ? 'Leave' : 'Remove',
                                  success: self
                                    ? 'You left the workspace.'
                                    : `${member.name} was removed.`,
                                  run: async () => {
                                    await writePlatform(
                                      `${base}/members/${member.userId}`,
                                      'DELETE',
                                    );
                                    if (self) router.replace('/dashboard');
                                    return true;
                                  },
                                });
                              }}
                            >
                              {self ? 'Leave' : 'Remove'}
                              {!self && (
                                <span className="sr-only"> {member.name}</span>
                              )}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {can('member.manage') && !roles && (
              <p className="text-xs text-muted-foreground">
                Your role needs role.read to invite members or change roles.
              </p>
            )}
          </TabsContent>
        )}

        {invitations && (
          <TabsContent value="invitations" className="space-y-4">
            <div>
              <h2 className="font-semibold">Open invitations</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Links are single use and expire after seven days. Invitees also
                see them on their dashboard after signing in.
              </p>
            </div>
            <div className="overflow-x-auto rounded-xl bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires (UTC)</TableHead>
                    <TableHead>
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        No open invitations.
                      </TableCell>
                    </TableRow>
                  )}
                  {invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell className="py-3">{invitation.email}</TableCell>
                      <TableCell>{invitation.role.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            invitation.status === 'pending'
                              ? 'outline'
                              : 'secondary'
                          }
                        >
                          {invitation.status === 'pending'
                            ? 'Pending'
                            : 'Expired'}
                        </Badge>
                      </TableCell>
                      <TableCell>{date(invitation.expiresAt)}</TableCell>
                      <TableCell className="space-x-1 text-right">
                        {can('member.manage') && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={async () => {
                                const outcome = await perform(() =>
                                  writePlatform<SentInvitation>(
                                    `${base}/invitations/${invitation.id}/resend`,
                                    'POST',
                                    {},
                                  ),
                                );
                                if (outcome.ok)
                                  toast.success(
                                    outcome.value.emailDelivery === 'sent'
                                      ? `New link sent to ${outcome.value.email}.`
                                      : 'Link renewed. Email could not be sent.',
                                  );
                              }}
                            >
                              Resend
                              <span className="sr-only">
                                {' '}
                                to {invitation.email}
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                setError('');
                                setConfirm({
                                  title: `Revoke the invitation for ${invitation.email}?`,
                                  description:
                                    'The link stops working immediately. You can send a new invitation later.',
                                  action: 'Revoke',
                                  success: 'Invitation revoked.',
                                  run: () =>
                                    writePlatform(
                                      `${base}/invitations/${invitation.id}/revoke`,
                                      'POST',
                                      {},
                                    ),
                                });
                              }}
                            >
                              Revoke
                              <span className="sr-only">
                                {' '}
                                invitation for {invitation.email}
                              </span>
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}

        {roles && (
          <TabsContent value="roles" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Roles</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Roles group permissions. Access is always checked by
                  permission.
                </p>
              </div>
              {can('role.manage') && (
                <Button
                  onClick={() => {
                    setError('');
                    setEditing('new');
                  }}
                >
                  <Plus className="size-4" />
                  Create role
                </Button>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {roles.map((role) => {
                const editable =
                  can('role.manage') &&
                  !role.system &&
                  holdsAll(permissions, role.permissions);
                return (
                  <article
                    key={role.id}
                    className="rounded-xl border bg-white p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex items-center gap-2 font-semibold">
                          {role.name}
                          {role.system && (
                            <Badge variant="secondary">System</Badge>
                          )}
                        </h3>
                        <p className="font-mono text-xs text-muted-foreground">
                          {role.slug}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {role.memberCount}{' '}
                        {role.memberCount === 1 ? 'member' : 'members'}
                      </p>
                    </div>
                    {role.description && (
                      <p className="mt-3 text-sm">{role.description}</p>
                    )}
                    <p className="mt-3 font-mono text-xs leading-5 text-muted-foreground">
                      {role.permissions.length
                        ? role.permissions.join(', ')
                        : 'No permissions'}
                    </p>
                    {editable && (
                      <div className="mt-4 flex gap-2 border-t pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setError('');
                            setEditing(role);
                          }}
                        >
                          Edit<span className="sr-only"> {role.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => {
                            setError('');
                            setConfirm({
                              title: `Delete the ${role.name} role?`,
                              description:
                                'Roles still assigned to members or open invitations cannot be deleted.',
                              action: 'Delete',
                              success: 'Role deleted.',
                              run: async () => {
                                await writePlatform(
                                  `${base}/roles/${role.id}`,
                                  'DELETE',
                                );
                                return true;
                              },
                            });
                          }}
                        >
                          Delete<span className="sr-only"> {role.name}</span>
                        </Button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              The Owner role always holds every permission. You can only grant
              permissions you hold yourself, and at least one member must keep
              member.manage and role.manage.
            </p>
          </TabsContent>
        )}
      </Tabs>

      <Dialog
        open={inviting}
        onOpenChange={(open) => {
          if (!busy) setInviting(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>
              They will receive a link by email and can also accept from their
              dashboard after signing in with this address.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={invite} className="space-y-5">
            <label className="grid gap-2 text-sm font-medium">
              Email address
              <Input
                name="email"
                type="email"
                required
                maxLength={320}
                autoComplete="off"
                disabled={busy}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Role
              <select
                name="roleId"
                required
                disabled={busy}
                className={selectClass}
                defaultValue={
                  assignable.find((role) => !role.system)?.id ??
                  assignable[0]?.id
                }
              >
                {assignable.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              disabled={busy || assignable.length === 0}
              type="submit"
              className="w-full"
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!busy && !open) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing === 'new' ? 'Create role' : `Edit ${editing?.name}`}
            </DialogTitle>
            <DialogDescription>
              Choose what members with this role can do. Permissions you do not
              hold are unavailable.
            </DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <form
              key={editing === 'new' ? 'new' : editing.id}
              onSubmit={saveRole}
              className="space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Name
                  <Input
                    name="name"
                    required
                    maxLength={80}
                    disabled={busy}
                    defaultValue={editing === 'new' ? '' : editing.name}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Slug
                  <Input
                    name="slug"
                    required
                    maxLength={80}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    title="Lowercase letters, numbers and single hyphens"
                    disabled={busy}
                    defaultValue={editing === 'new' ? '' : editing.slug}
                  />
                </label>
              </div>
              <label className="grid gap-2 text-sm font-medium">
                Description
                <Input
                  name="description"
                  maxLength={500}
                  disabled={busy}
                  defaultValue={
                    editing === 'new' ? '' : (editing.description ?? '')
                  }
                />
              </label>
              <fieldset className="space-y-4">
                <legend className="text-sm font-medium">Permissions</legend>
                {groups.map((group) => (
                  <div key={group} className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {group.replace('_', ' ')}
                    </p>
                    {catalog
                      .filter(({ key }) => key.startsWith(`${group}.`))
                      .map(({ key, description }) => (
                        <label
                          key={key}
                          className="flex items-start gap-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="permissions"
                            value={key}
                            className="mt-1"
                            disabled={busy || !permissions.includes(key)}
                            defaultChecked={
                              editing !== 'new' &&
                              editing.permissions.includes(key)
                            }
                          />
                          <span>
                            <code className="text-xs">{key}</code>
                            <span className="block text-xs text-muted-foreground">
                              {description}
                            </span>
                          </span>
                        </label>
                      ))}
                  </div>
                ))}
              </fieldset>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button disabled={busy} type="submit" className="w-full">
                {busy ? 'Saving…' : 'Save role'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!busy && !open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.description}</DialogDescription>
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
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={confirmAction}
            >
              {busy ? 'Working…' : confirm?.action}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
