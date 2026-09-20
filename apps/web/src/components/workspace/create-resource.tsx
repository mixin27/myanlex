'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ResourceForm } from './resource-form';

export function CreateResource({
  organizationId,
}: {
  organizationId?: string;
}) {
  const [open, setOpen] = useState(false);
  const title = organizationId ? 'New project' : 'New workspace';
  return (
    <>
      <Button
        variant={organizationId ? 'default' : 'outline'}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
        {title}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {organizationId
                ? 'Separate your applications and environments with a project.'
                : 'A workspace groups your team, projects, and access permissions.'}
            </DialogDescription>
          </DialogHeader>
          <ResourceForm
            embedded
            {...(organizationId ? { organizationId } : {})}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
