'use client';
import { useState } from 'react';
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
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'slug', header: 'Slug' },
    { accessorKey: 'environment', header: 'Environment' },
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
      <DataTable
        columns={columns}
        data={projects}
        emptyMessage="No projects on this page."
      />
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
