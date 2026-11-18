'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type {
  AuditAction,
  AuditEvent,
  AuditEventPage,
} from '@/lib/platform-types';
import { readPlatformClient } from '@/lib/platform-client';
import { auditActionLabels, describeAuditEvent } from '@/lib/audit-format';

const selectClass = 'h-9 rounded-md border bg-background px-3 text-sm';
const timestamp = (value: string) =>
  `${value.slice(0, 10)} ${value.slice(11, 16)}`;

/** Newest-first administrative history for one workspace (audit.read). */
export function AuditLog({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: AuditEventPage;
}) {
  const [items, setItems] = useState<AuditEvent[]>(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [action, setAction] = useState<AuditAction | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load(filter: AuditAction | '', after: string | null) {
    setLoading(true);
    setError('');
    const query = new URLSearchParams({ limit: '50' });
    if (filter) query.set('action', filter);
    if (after) query.set('cursor', after);
    try {
      const page = await readPlatformClient<AuditEventPage>(
        `organizations/${organizationId}/audit-events?${query}`,
      );
      setItems((current) => (after ? [...current, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to load activity.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Activity</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Who changed members, roles, invitations, projects and API keys.
            Records are kept for a limited time, one year by default.
          </p>
        </div>
        <label className="grid gap-1 text-xs font-medium">
          Show
          <select
            aria-label="Filter activity"
            className={selectClass}
            value={action}
            disabled={loading}
            onChange={(event) => {
              const next = event.target.value as AuditAction | '';
              setAction(next);
              void load(next, null);
            }}
          >
            <option value="">All activity</option>
            {Object.entries(auditActionLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <ol className="divide-y rounded-xl bg-white">
        {items.map((event) => (
          <li key={event.id} className="px-4 py-3">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm">{describeAuditEvent(event)}</span>
                <time
                  dateTime={event.createdAt}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {timestamp(event.createdAt)} UTC
                </time>
              </summary>
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-[8rem_1fr]">
                <dt>Action</dt>
                <dd>
                  <code>{event.action}</code>
                </dd>
                <dt>Target</dt>
                <dd>
                  <code>
                    {event.target.type} {event.target.id}
                  </code>
                </dd>
                {event.requestId && (
                  <>
                    <dt>Request</dt>
                    <dd>
                      <code>{event.requestId}</code>
                    </dd>
                  </>
                )}
                <dt>Details</dt>
                <dd>
                  <pre className="whitespace-pre-wrap break-all">
                    {JSON.stringify(event.metadata, null, 2)}
                  </pre>
                </dd>
              </dl>
            </details>
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            {loading ? 'Loading…' : 'No activity recorded yet.'}
          </li>
        )}
      </ol>
      {cursor && (
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void load(action, cursor)}
        >
          {loading ? 'Loading…' : 'Load older activity'}
        </Button>
      )}
    </div>
  );
}
