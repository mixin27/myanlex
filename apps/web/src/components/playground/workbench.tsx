'use client';

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowLeft, FlaskConical, Play, Square, Trash2 } from 'lucide-react';
import { engineBuild, executionSchema, operations } from '@myanlex/playground';
import type {
  ExecutionMode,
  ExecutionRequest,
  Operation,
  Run,
} from '@myanlex/playground';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InputEditor } from './input-editor';
import type { EditorRow } from './input-editor';
import { ResultView } from './result-view';
import { DeveloperTools } from './developer-tools';
import { SavedRuns } from './saved-runs';
import { LocalRunner } from '@/lib/playground/local-runner';
import {
  parseRun,
  PlaygroundHttpError,
  playgroundFetch,
} from '@/lib/playground/client';
import type {
  Organization,
  OrganizationAccess,
  Page,
  Project,
} from '@/lib/platform-types';

export function executionRequest(
  operation: Operation,
  text: string,
  rows: EditorRow[],
  from: 'unicode' | 'zawgyi',
  to: 'unicode' | 'zawgyi',
  guarded: boolean,
): ExecutionRequest {
  if (operation === 'batch_syllabify')
    return { operation, payload: { items: rows } };
  if (operation === 'batch_transliterate')
    return { operation, payload: { items: rows, scheme: 'ala-lc-2011' } };
  if (operation === 'convert')
    return { operation, payload: { text, from, to, validateSource: guarded } };
  if (operation === 'transliterate')
    return { operation, payload: { text, scheme: 'ala-lc-2011' } };
  return { operation, payload: { text } };
}
export function runShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  isComposing: boolean;
}): boolean {
  return (
    event.key === 'Enter' &&
    (event.ctrlKey || event.metaKey) &&
    !event.isComposing
  );
}

export function Workbench({
  user,
  docsUrl,
}: {
  user: { name: string } | null;
  docsUrl: string;
}) {
  const [mode, setMode] = useState<ExecutionMode>('local');
  const [operation, setOperation] = useState<Operation>('detect');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<EditorRow[]>([{ id: 'row-1', text: '' }]);
  const [from, setFrom] = useState<'unicode' | 'zawgyi'>('unicode');
  const [to, setTo] = useState<'unicode' | 'zawgyi'>('zawgyi');
  const [guarded, setGuarded] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [runKey, setRunKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [paneWidth, setPaneWidth] = useState(45);
  const [secondary, setSecondary] = useState('developer');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationCursor, setOrganizationCursor] = useState<string | null>(
    null,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectCursor, setProjectCursor] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [access, setAccess] = useState<OrganizationAccess | null>(null);
  const [contextNotice, setContextNotice] = useState('');
  const runner = useRef<LocalRunner | null>(null);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(0);
  const request = useMemo(
    () => executionRequest(operation, text, rows, from, to, guarded),
    [operation, text, rows, from, to, guarded],
  );
  const path =
    organizationId && projectId
      ? `organizations/${organizationId}/projects/${projectId}/playground`
      : null;
  const key = JSON.stringify({
    request,
    mode,
    project: mode === 'api' ? path : null,
  });
  const latestKey = useRef(key);
  const latestRun = useRef(run);
  useLayoutEffect(() => {
    latestKey.current = key;
    latestRun.current = run;
  }, [key, run]);
  const stale = !!run && key !== runKey;
  const canInvoke =
    !!user &&
    !!path &&
    !!access?.permissions.includes('api.invoke') &&
    !!access.permissions.includes('project.read');
  const needContext = !!user && (mode === 'api' || secondary === 'saved');
  const cancel = useCallback(
    (
      message = 'Cancelled. The server may already have processed an API request and consumed quota.',
    ) => {
      active.current++;
      runner.current?.cancel();
      controller.current?.abort();
      controller.current = null;
      setBusy(false);
      setNotice(message);
    },
    [],
  );
  useEffect(
    () => () => {
      active.current++;
      runner.current?.cancel();
      controller.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest?.('a[href]');
      if (
        anchor &&
        !window.confirm(
          'Leave the playground? Unsaved text and runs are held only in memory.',
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', unload);
    const href = window.location.href;
    const state = window.history.state;
    const historyNavigation = (event: PopStateEvent) => {
      if (
        !window.confirm(
          'Leave the playground? Unsaved text and runs are held only in memory.',
        )
      ) {
        event.stopImmediatePropagation();
        window.history.pushState(state, '', href);
      }
    };
    window.addEventListener('popstate', historyNavigation, true);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('popstate', historyNavigation, true);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty]);
  useEffect(() => {
    if (!needContext) return;
    let mounted = true;
    playgroundFetch<Page<Organization>>('organizations?limit=100')
      .then((page) => {
        if (mounted) {
          setOrganizations(page.items);
          setOrganizationCursor(page.nextCursor);
        }
      })
      .catch((error) => {
        if (mounted)
          setContextNotice(
            error instanceof Error
              ? error.message
              : 'Unable to load organizations.',
          );
      });
    return () => {
      mounted = false;
    };
  }, [needContext]);
  useEffect(() => {
    if (!needContext || !organizationId) return;
    let mounted = true;
    Promise.all([
      playgroundFetch<OrganizationAccess>(`organizations/${organizationId}`),
      playgroundFetch<Page<Project>>(
        `organizations/${organizationId}/projects?limit=100`,
      ),
    ])
      .then(([org, page]) => {
        if (mounted) {
          setAccess(org);
          setProjects(page.items);
          setProjectCursor(page.nextCursor);
          setContextNotice('');
        }
      })
      .catch((error) => {
        if (mounted)
          setContextNotice(
            error instanceof Error ? error.message : 'Unable to load projects.',
          );
      });
    return () => {
      mounted = false;
    };
  }, [needContext, organizationId]);
  async function execute() {
    if (busy) return;
    if (mode === 'api' && !canInvoke) {
      setNotice(
        'Sign in with a verified account, select a project, and obtain project.read and api.invoke permissions.',
      );
      return;
    }
    const parsed = executionSchema.safeParse(request);
    if (!parsed.success) {
      setNotice(
        'Check the operation options and unique batch IDs (1–120 characters).',
      );
      return;
    }
    if (
      parsed.data.operation === 'convert' &&
      parsed.data.payload.validateSource === false &&
      !window.confirm(
        'Run unchecked conversion? Mixed or incorrectly labeled input may change meaning. Keep the original.',
      )
    )
      return;
    const current = ++active.current;
    const snapshotKey = key;
    setBusy(true);
    setNotice('');
    try {
      let result: Run;
      if (mode === 'local') {
        runner.current ??= new LocalRunner(
          () =>
            new Worker(
              new URL('../../lib/playground/engine.worker.ts', import.meta.url),
              { type: 'module' },
            ),
        );
        result = parseRun(await runner.current.execute(parsed.data));
      } else {
        controller.current = new AbortController();
        const deadline = setTimeout(
          () => controller.current?.abort('timeout'),
          30_000,
        );
        try {
          result = parseRun(
            await playgroundFetch(
              `${path}/execute`,
              'POST',
              parsed.data,
              controller.current.signal,
            ),
          );
        } finally {
          clearTimeout(deadline);
        }
      }
      if (current !== active.current) return;
      if (latestKey.current !== snapshotKey) {
        setNotice(
          'Input or options changed during execution. The response was discarded; run the current request explicitly.',
        );
        return;
      }
      setRun(result);
      setRunKey(snapshotKey);
      setDirty(true);
      if (result.mode === 'api' && result.build !== engineBuild)
        setNotice(
          'API and local engine builds differ. Do not assume identical behavior across these versions.',
        );
    } catch (error) {
      if (current !== active.current) return;
      const message =
        error instanceof PlaygroundHttpError
          ? `${error.message} Code: ${error.code}.${error.retryAfter ? ` Retry-After: ${error.retryAfter} seconds.` : ''}${error.requestId ? ` Request: ${error.requestId}` : ''}`
          : (error instanceof Error && error.message === 'timeout') ||
              controller.current?.signal.aborted
            ? 'Execution timed out. Retry explicitly; an API request may already have consumed quota.'
            : 'Processing unavailable. Your input is preserved. Retry explicitly in the selected mode.';
      setNotice(message);
      if (
        error instanceof PlaygroundHttpError &&
        latestKey.current === snapshotKey
      ) {
        setRun({
          request: parsed.data,
          mode: 'api',
          build: 'unavailable',
          profiles: [],
          elapsedMs: 0,
          error: { code: error.code, message: error.message },
          httpStatus: error.status,
          ...(error.requestId ? { requestId: error.requestId } : {}),
        });
        setRunKey(snapshotKey);
      }
    } finally {
      if (current === active.current) {
        setBusy(false);
        controller.current = null;
      }
    }
  }
  function openSaved(snapshot: Run) {
    cancel('Opened a saved artifact without execution.');
    setOperation(snapshot.request.operation);
    setMode(snapshot.mode);
    const payload = snapshot.request.payload;
    if ('text' in payload) setText(payload.text);
    if ('items' in payload) setRows(payload.items);
    if ('from' in payload) {
      setFrom(payload.from);
      setTo(payload.to);
      setGuarded(payload.validateSource ?? true);
    }
    setRun(snapshot);
    setRunKey(
      JSON.stringify({
        request: executionRequest(
          snapshot.request.operation,
          'text' in payload ? payload.text : '',
          'items' in payload ? payload.items : [],
          'from' in payload ? payload.from : 'unicode',
          'to' in payload ? payload.to : 'zawgyi',
          'validateSource' in payload ? (payload.validateSource ?? true) : true,
        ),
        mode: snapshot.mode,
        project: snapshot.mode === 'api' ? path : null,
      }),
    );
    setDirty(false);
  }
  function edit<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setDirty(true);
    };
  }
  return (
    <main
      className="min-h-screen bg-background"
      onKeyDown={(event) => {
        if (
          runShortcut({
            key: event.key,
            ctrlKey: event.ctrlKey,
            metaKey: event.metaKey,
            isComposing: event.nativeEvent.isComposing,
          })
        ) {
          event.preventDefault();
          void execute();
        }
      }}
    >
      <header className="border-b">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-4 md:px-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="size-4" />
            Console
          </Link>
          <span className="h-5 w-px bg-border" />
          <FlaskConical className="size-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">
            MyanLex Playground
          </h1>
          <nav className="ml-auto flex gap-4 text-sm">
            <Link href={docsUrl}>Documentation</Link>
            <Link href={user ? '/account' : '/login'}>
              {user ? user.name : 'Sign in'}
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-end gap-4">
          <label className="min-w-56 flex-1 text-sm font-medium">
            Operation
            <select
              className="mt-2 block w-full rounded-lg border bg-background p-3"
              value={operation}
              onChange={(event) => {
                cancel('Operation changed. Run explicitly.');
                setOperation(event.target.value as Operation);
              }}
            >
              {Object.entries(operations).map(([value, info]) => (
                <option key={value} value={value}>
                  {info.label}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="flex gap-1 rounded-lg border p-1">
            <legend className="sr-only">Execution mode</legend>
            {(['local', 'api'] as const).map((value) => (
              <Button
                key={value}
                variant={mode === value ? 'default' : 'ghost'}
                aria-pressed={mode === value}
                onClick={() => {
                  if (mode !== value) {
                    cancel('Execution mode changed. No request was sent.');
                    setMode(value);
                  }
                }}
              >
                {value === 'local' ? 'Local engine' : 'API'}
              </Button>
            ))}
          </fieldset>
          <Button
            onClick={() => void execute()}
            disabled={busy || (mode === 'api' && !canInvoke)}
          >
            <Play className="size-4" />
            {busy ? 'Running…' : 'Run'}
          </Button>
          <Button variant="outline" disabled={!busy} onClick={() => cancel()}>
            <Square className="size-4" />
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              cancel('Cleared.');
              setText('');
              setRows([{ id: 'row-1', text: '' }]);
              setRun(null);
              setDirty(false);
            }}
          >
            <Trash2 className="size-4" />
            Clear
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {mode === 'local'
            ? 'Local mode: processing stays in this browser. No sign-in or API quota. Loading this page requires the site; there is no offline reload guarantee.'
            : 'API mode: Run uploads the submitted text to MyanLex and uses the selected organization’s applicable allowance.'}{' '}
          <span className="whitespace-nowrap">
            Run shortcut: Ctrl/Cmd+Enter.
          </span>
        </p>
        {(mode === 'api' || secondary === 'saved') && (
          <Card>
            <CardContent className="space-y-3 p-4">
              {!user ? (
                <p>
                  <Link className="underline" href="/login">
                    Sign in with a verified account
                  </Link>{' '}
                  to execute via API or save runs. Local processing remains
                  available.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    <label className="min-w-48 flex-1 text-sm">
                      Organization
                      <select
                        className="mt-1 block w-full rounded-md border bg-background p-2"
                        value={organizationId}
                        onChange={(event) => {
                          cancel('Project context changed.');
                          setOrganizationId(event.target.value);
                          setProjectId('');
                          setProjects([]);
                          setAccess(null);
                        }}
                      >
                        <option value="">Select organization</option>
                        {organizations.map((org) => (
                          <option key={org.id} value={org.id}>
                            {org.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="min-w-48 flex-1 text-sm">
                      Project
                      <select
                        className="mt-1 block w-full rounded-md border bg-background p-2"
                        value={projectId}
                        onChange={(event) => {
                          cancel('Project context changed.');
                          setProjectId(event.target.value);
                        }}
                      >
                        <option value="">Select project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name} · {project.environment}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {organizationCursor && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void playgroundFetch<Page<Organization>>(
                          `organizations?limit=100&after=${organizationCursor}`,
                        )
                          .then((page) => {
                            setOrganizations([...organizations, ...page.items]);
                            setOrganizationCursor(page.nextCursor);
                          })
                          .catch(() =>
                            setContextNotice(
                              'Unable to load more organizations.',
                            ),
                          );
                      }}
                    >
                      More organizations
                    </Button>
                  )}
                  {projectCursor && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void playgroundFetch<Page<Project>>(
                          `organizations/${organizationId}/projects?limit=100&after=${projectCursor}`,
                        )
                          .then((page) => {
                            setProjects([...projects, ...page.items]);
                            setProjectCursor(page.nextCursor);
                          })
                          .catch(() =>
                            setContextNotice('Unable to load more projects.'),
                          );
                      }}
                    >
                      More projects
                    </Button>
                  )}
                  {access && !canInvoke && path && (
                    <p className="text-sm">
                      Execution/saving requires project.read and api.invoke.
                      Existing saved runs can still be read with project access.
                    </p>
                  )}
                </>
              )}
              <p role="status" className="text-sm">
                {contextNotice}
              </p>
            </CardContent>
          </Card>
        )}
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-muted px-3 py-2 text-sm"
        >
          {busy
            ? 'Processing… Cancel stops waiting; an API request may still complete.'
            : notice || operations[operation].note}
        </p>
        <div
          className="playground-panes"
          style={{ '--input-width': `${paneWidth}%` } as React.CSSProperties}
        >
          <section
            className="min-w-0 space-y-4 rounded-2xl border p-4 md:p-6"
            aria-label="Input"
          >
            <h2 className="font-semibold">Input and options</h2>
            <InputEditor
              operation={operation}
              text={text}
              setText={edit(setText)}
              rows={rows}
              setRows={edit(setRows)}
              from={from}
              to={to}
              setFrom={edit(setFrom)}
              setTo={edit(setTo)}
              guarded={guarded}
              setGuarded={edit(setGuarded)}
            />
          </section>
          <div className="hidden items-center justify-center lg:flex">
            <input
              aria-label="Input pane width"
              type="range"
              min={30}
              max={65}
              value={paneWidth}
              onChange={(event) => setPaneWidth(Number(event.target.value))}
              className="h-32 w-4"
              style={{ writingMode: 'vertical-lr' }}
            />
          </div>
          <section
            className="min-w-0 space-y-4 rounded-2xl border p-4 md:p-6"
            aria-label="Results"
          >
            <h2 className="font-semibold">Result inspection</h2>
            <ResultView
              run={run}
              stale={stale}
              onApply={(output) => {
                setText(output);
                setDirty(true);
              }}
            />
          </section>
        </div>
        <section
          className="rounded-2xl border p-4 md:p-6"
          aria-label="Developer workflows"
        >
          <Tabs
            value={secondary}
            onValueChange={(value) => setSecondary(String(value))}
          >
            <TabsList>
              <TabsTrigger value="developer">Developer tools</TabsTrigger>
              <TabsTrigger value="saved">Saved runs</TabsTrigger>
            </TabsList>
            <TabsContent value="developer">
              <DeveloperTools request={request} run={run} />
            </TabsContent>
            <TabsContent value="saved">
              <SavedRuns
                key={path}
                path={user ? path : null}
                run={run}
                onOpen={openSaved}
                onSaved={() => {
                  if (
                    !stale &&
                    latestKey.current === key &&
                    latestRun.current === run
                  )
                    setDirty(false);
                }}
              />
            </TabsContent>
          </Tabs>
        </section>
        <footer className="flex flex-wrap justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Originals stay unchanged until you explicitly apply output.
            Independent linguistic review remains outstanding.
          </span>
          <Link href="/playground/notices" className="underline">
            Engine licenses and notices
          </Link>
        </footer>
      </div>
    </main>
  );
}
