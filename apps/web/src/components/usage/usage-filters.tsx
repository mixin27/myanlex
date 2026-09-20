'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { validateUsageDates } from '@/lib/usage-range';

export function UsageFilters({
  organizationId,
  projectId,
  from,
  to,
  today,
  initialError,
}: {
  organizationId: string;
  projectId: string;
  from: string;
  to: string;
  today: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError ?? '');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const start = String(data.get('from'));
    const end = String(data.get('to'));
    const issue = validateUsageDates(start, end, today);
    if (issue) {
      setError(issue);
      return;
    }
    setError('');
    router.push(
      `/usage?${new URLSearchParams({ organization: organizationId, project: projectId, from: start, to: end })}`,
    );
    router.refresh();
  }
  return (
    <div className="rounded-xl border bg-white p-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          From (UTC)
          <Input
            type="date"
            name="from"
            min="1970-01-01"
            max={today}
            defaultValue={from}
            required
            className="w-44 bg-white"
          />
        </label>
        <label className="grid gap-1.5 text-xs text-muted-foreground">
          Through (UTC)
          <Input
            type="date"
            name="to"
            min="1970-01-01"
            max={today}
            defaultValue={to}
            required
            className="w-44 bg-white"
          />
        </label>
        <Button type="submit">Apply range</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            router.push(
              `/usage?organization=${organizationId}&project=${projectId}`,
            );
            router.refresh();
          }}
        >
          Last 30 days
        </Button>
        <span className="pb-2 text-xs text-muted-foreground">
          Up to 90 days · today is partial
        </span>
      </form>
      {error && (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
