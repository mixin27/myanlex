'use client';

import { useEffect, useRef, useState } from 'react';
import type { Run } from '@myanlex/playground';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  downloadJson,
  parseRun,
  playgroundFetch,
} from '@/lib/playground/client';

interface Saved {
  id: string;
  title: string;
  createdAt: string;
  expiresAt: string;
  payloadSize: number;
  snapshot?: Run;
}
export function SavedRuns({
  path,
  run,
  onOpen,
  onSaved,
}: {
  path: string | null;
  run: Run | null;
  onOpen: (run: Run) => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<Saved[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [acknowledgedRun, setAcknowledgedRun] = useState<Run | null>(null);
  const acknowledged = run !== null && acknowledgedRun === run;
  const setAcknowledged = (value: boolean) =>
    setAcknowledgedRun(value ? run : null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const attempt = useRef<{ content: string; id: string } | null>(null);
  const generation = useRef(0);
  async function load(after?: string, replace = false) {
    if (!path) return;
    const current = generation.current;
    try {
      const page = await playgroundFetch<{
        items: Saved[];
        nextCursor: string | null;
      }>(`${path}/runs?limit=20${after ? `&after=${after}` : ''}`);
      if (current !== generation.current) return;
      setItems((existing) =>
        replace ? page.items : [...existing, ...page.items],
      );
      setCursor(page.nextCursor);
    } catch (error) {
      if (current === generation.current)
        setNotice(
          error instanceof Error ? error.message : 'Saved runs unavailable.',
        );
    }
  }
  useEffect(() => {
    generation.current++;
    const current = generation.current;
    if (path)
      void Promise.resolve().then(() => {
        if (current === generation.current) return load(undefined, true);
      });
    return () => {
      generation.current++; // eslint-disable-line react-hooks/exhaustive-deps
    };
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    if (!path || !run || !acknowledged || !title.trim()) return;
    const content = JSON.stringify({ title: title.trim(), snapshot: run });
    if (attempt.current?.content !== content)
      attempt.current = { content, id: crypto.randomUUID() };
    const body = { id: attempt.current.id, title: title.trim(), snapshot: run };
    if (new TextEncoder().encode(JSON.stringify(body)).length > 1_048_576) {
      setNotice(
        'This run exceeds 1 MiB. Download it instead; it will not be truncated.',
      );
      return;
    }
    const current = generation.current;
    setBusy(true);
    setNotice('');
    try {
      await playgroundFetch(`${path}/runs`, 'POST', body);
      if (current !== generation.current) return;
      setNotice('Saved privately. This snapshot expires in 30 days.');
      onSaved();
      setAcknowledged(false);
      await load(undefined, true);
    } catch (error) {
      if (current === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : 'Save failed. You can retry the same save without running the operation again.',
        );
    } finally {
      setBusy(false);
    }
  }
  async function action(
    row: Saved,
    kind: 'open' | 'export' | 'rename' | 'delete',
  ) {
    if (!path) return;
    const current = generation.current;
    setBusy(true);
    try {
      if (kind === 'delete') {
        if (
          !window.confirm(
            'Delete this saved text and result from the primary database? Backup copies follow the operator retention policy.',
          )
        )
          return;
        await playgroundFetch(`${path}/runs/${row.id}`, 'DELETE');
      } else if (kind === 'rename') {
        const value = window.prompt(
          'Saved run title (up to 120 characters)',
          row.title,
        );
        if (!value?.trim()) return;
        await playgroundFetch(`${path}/runs/${row.id}`, 'PATCH', {
          title: value,
        });
      } else {
        const saved = await playgroundFetch<Saved>(`${path}/runs/${row.id}`);
        if (current !== generation.current) return;
        const snapshot = parseRun(saved.snapshot);
        if (kind === 'open') onOpen(snapshot);
        else downloadJson('myanlex-saved-run.json', { ...saved, snapshot });
        setNotice(
          kind === 'open'
            ? 'Opened a user-submitted snapshot. It was not re-executed or independently verified.'
            : 'Exported the complete saved snapshot, including text.',
        );
        return;
      }
      if (current === generation.current) await load(undefined, true);
    } catch (error) {
      if (current === generation.current)
        setNotice(
          error instanceof Error
            ? error.message
            : 'Saved-run operation failed.',
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Only explicit saves upload and store a run. Private to you; current
        project access is required. Up to 50 active runs across projects, 1 MiB
        each, expiring after 30 days.
      </p>
      {!path ? (
        <p>Select a project after signing in to save or read your runs.</p>
      ) : (
        <>
          <form
            className="space-y-3 rounded-xl border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block text-sm font-medium">
              Run title
              <Input
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Name this experiment"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>
                I want to upload this run’s original text, options and result to
                server storage for 30 days.{' '}
                {run?.mode === 'local' &&
                  'Local processing did not upload it; this Save action does.'}
              </span>
            </label>
            <Button
              disabled={busy || !run || !acknowledged || !title.trim()}
              type="submit"
            >
              {busy ? 'Working…' : 'Save run'}
            </Button>
          </form>
          <div className="flex justify-between">
            <h3 className="font-medium">Your saved runs</h3>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void load(undefined, true)}
            >
              Refresh
            </Button>
          </div>
          {!items.length && (
            <p className="text-sm text-muted-foreground">
              No saved runs loaded.
            </p>
          )}
          {items.map((row) => (
            <article key={row.id} className="rounded-xl border p-3">
              <h4 className="font-medium">
                <bdi>{row.title}</bdi>
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                Expires {new Date(row.expiresAt).toLocaleString()} ·{' '}
                {(row.payloadSize / 1024).toFixed(1)} KiB
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['open', 'export', 'rename', 'delete'] as const).map(
                  (kind) => (
                    <Button
                      key={kind}
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => void action(row, kind)}
                    >
                      {kind.charAt(0).toUpperCase() + kind.slice(1)}
                    </Button>
                  ),
                )}
              </div>
            </article>
          ))}
          {cursor && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void load(cursor)}
            >
              Load more
            </Button>
          )}
        </>
      )}
      <p role="status" className="text-sm">
        {notice}
      </p>
      <p className="text-xs text-muted-foreground">
        Snapshots are user-submitted artifacts. Labels do not attest server
        verification. Deletion removes primary storage; backups follow the
        operator’s retention policy.
      </p>
    </div>
  );
}
