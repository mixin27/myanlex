'use client';
import { useState } from 'react';
import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/data-table';
import type { DataTableFeatures } from '@/components/data-table';
import type { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Project } from '@/lib/platform-types';
import { ResourceForm } from './resource-form';

export function ProjectTable({
  projects,
  canUpdate,
}: {
  projects: Project[];
  canUpdate: boolean;
}) {
  const [editing, setEditing] = useState<Project | null>(null);
  const columns: ColumnDef<DataTableFeatures, Project>[] = [
    {
      accessorKey: 'name',
      header: 'Project',
      cell: ({ row }) => (
        <Link
          className="flex items-center gap-3 py-2 font-medium hover:underline"
          href={`/api-keys?organization=${row.original.organizationId}&project=${row.original.id}`}
        >
          <span className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
            <FolderKanban className="size-4" />
          </span>
          {row.original.name}
        </Link>
      ),
    },
    { accessorKey: 'slug', header: 'Slug' },
    {
      accessorKey: 'environment',
      header: 'Environment',
      cell: ({ row }) => (
        <Badge variant="outline">{row.original.environment}</Badge>
      ),
    },
    ...(canUpdate
      ? [
          {
            id: 'actions',
            header: 'Actions',
            cell: ({ row }: { row: { original: Project } }) => (
              <Button
                variant="outline"
                onClick={() => setEditing(row.original)}
              >
                Edit <span className="sr-only">{row.original.name}</span>
              </Button>
            ),
          },
        ]
      : []),
  ];
  return (
    <>
      <div className="overflow-hidden rounded-xl bg-white">
        <DataTable
          columns={columns}
          data={projects}
          emptyMessage="No projects on this page."
        />
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Project settings</DialogTitle>
          </DialogHeader>
          {editing && (
            <ResourceForm
              embedded
              key={editing.id}
              organizationId={editing.organizationId}
              project={editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
