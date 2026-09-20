'use client';

import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { writePlatform } from '@/lib/platform-client';
import type { Organization, Project } from '@/lib/platform-types';

export function ResourceForm({
  organizationId,
  project,
  onDone,
  embedded = false,
}: {
  organizationId?: string;
  project?: Project;
  onDone?: () => void;
  embedded?: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [environment, setEnvironment] = useState(
    project?.environment ?? 'development',
  );
  const title = project
    ? 'Edit project'
    : organizationId
      ? 'Create project'
      : 'Create workspace';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = event.currentTarget;
    const data = new FormData(form);
    const input = {
      name: String(data.get('name')).trim(),
      slug: String(data.get('slug')),
      ...(organizationId ? { environment } : {}),
    };
    const path = organizationId
      ? `organizations/${organizationId}/projects${project ? `/${project.id}` : ''}`
      : 'organizations';
    try {
      const result = await writePlatform<Organization>(
        path,
        project ? 'PATCH' : 'POST',
        input,
      );
      toast.success(
        project
          ? 'Project updated.'
          : organizationId
            ? 'Project created.'
            : 'Organization created.',
      );
      if (!project) form.reset();
      if (!organizationId) router.push(`/projects?organization=${result.id}`);
      else if (!project)
        router.push(`/projects?organization=${organizationId}`);
      router.refresh();
      onDone?.();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : 'Unable to save. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={embedded ? 'border-0 p-0 shadow-none ring-0' : undefined}>
      {!embedded && (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent className={embedded ? 'p-0' : undefined}>
        <form onSubmit={submit} className="space-y-4">
          <label className="grid gap-2">
            Name
            <Input
              name="name"
              required
              maxLength={120}
              defaultValue={project?.name}
              disabled={busy}
            />
          </label>
          <label className="grid gap-2">
            Slug
            <Input
              name="slug"
              required
              maxLength={80}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              defaultValue={project?.slug}
              disabled={busy}
              aria-describedby={`${id}-slug`}
            />
          </label>
          <p id={`${id}-slug`} className="text-sm text-muted-foreground">
            Lowercase letters, numbers, and single hyphens. For example:
            my-team.
          </p>
          {organizationId && (
            <div className="grid gap-2">
              <span id={`${id}-environment`}>Environment</span>
              <Select
                value={environment}
                onValueChange={(value) => {
                  if (value) setEnvironment(value);
                }}
                disabled={busy}
              >
                <SelectTrigger aria-labelledby={`${id}-environment`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['development', 'staging', 'production'].map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : title}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
