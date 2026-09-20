'use client';
import { usePathname, useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Building2, Check, ChevronsUpDown, Search } from 'lucide-react';
import type { Organization } from '@/lib/platform-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

export function OrganizationPicker({
  organizations,
  selected,
}: {
  organizations: Organization[];
  selected?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const id = useId();
  const current = organizations.find((org) => org.id === selected);
  return (
    <>
      <Button
        variant="outline"
        className="h-14 w-full justify-start gap-3 bg-white sm:w-80"
        onClick={() => {
          setSearch('');
          setOpen(true);
        }}
        aria-label={`Switch workspace: ${current?.name ?? 'Choose workspace'}`}
      >
        <span className="rounded-md bg-emerald-50 p-2 text-emerald-800">
          <Building2 className="size-4" />
        </span>
        <span className="grid min-w-0 text-left">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Workspace
          </span>
          <span className="truncate">
            {current?.name ?? 'Choose workspace'}
          </span>
        </span>
        <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch workspace</DialogTitle>
            <DialogDescription>
              Projects and permissions belong to the selected workspace.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor={id} className="sr-only">
            Search loaded workspaces
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
            <Input
              id={id}
              className="pl-9"
              placeholder="Search workspaces…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {organizations
              .filter((org) =>
                `${org.name} ${org.slug}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((org) => (
                <button
                  key={org.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => {
                    router.push(
                      `${pathname}?organization=${encodeURIComponent(org.id)}`,
                    );
                    setOpen(false);
                  }}
                >
                  <Building2 className="size-4 text-muted-foreground" />
                  <span className="grid">
                    <span className="text-sm font-medium">{org.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {org.slug}
                    </span>
                  </span>
                  {org.id === selected && (
                    <Check className="ml-auto size-4 text-emerald-700" />
                  )}
                </button>
              ))}
            {!organizations.some((org) =>
              `${org.name} ${org.slug}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            ) && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No matching workspaces on this page.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
