'use client';

import { useEffect, useState } from 'react';
import type { OperationResult, Run, TextComparison } from '@myanlex/playground';
import { codePointToUtf16, visibleText } from '@myanlex/playground';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocalRunner } from '@/lib/playground/local-runner';
import { downloadJson } from '@/lib/playground/client';

export function PageRows({
  rows,
  render,
}: {
  rows: readonly unknown[];
  render: (row: unknown, index: number) => React.ReactNode;
}) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 100) - 1));
  return (
    <div>
      <div className="max-h-[32rem] space-y-2 overflow-auto">
        {rows.slice(current * 100, (current + 1) * 100).map((row, index) => (
          <div key={current * 100 + index}>
            {render(row, current * 100 + index)}
          </div>
        ))}
      </div>
      {rows.length > 100 && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </Button>
          <span className="text-xs">
            Page {current + 1} of {Math.ceil(rows.length / 100)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={(current + 1) * 100 >= rows.length}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
export function Highlight({
  text,
  start,
  end,
}: {
  text: string;
  start: number;
  end: number;
}) {
  const left = codePointToUtf16(text, start);
  const right = codePointToUtf16(text, end);
  return (
    <p className="break-words rounded-lg bg-muted p-3 leading-8" dir="auto">
      <bdi>
        {visibleText(text.slice(0, left))}
        <mark className="rounded bg-amber-200 text-black">
          {visibleText(text.slice(left, right))}
        </mark>
        {visibleText(text.slice(right))}
      </bdi>
    </p>
  );
}
function Readable({ result }: { result: OperationResult }) {
  const [span, setSpan] = useState<{
    start: number;
    end: number;
    input: string;
  } | null>(null);
  if ('results' in result)
    return (
      <>
        <p className="mb-3 text-sm">
          {result.results.filter((item) => item.success).length} successful;{' '}
          {result.results.filter((item) => !item.success).length} failed
        </p>
        <PageRows
          rows={result.results}
          render={(value) => {
            const row = value as (typeof result.results)[number];
            return (
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  <bdi>{visibleText(row.id)}</bdi> ·{' '}
                  {row.success ? 'Success' : `Failed: ${row.error.code}`}
                </summary>
                <div className="mt-3">
                  {row.success ? (
                    <Readable result={row.result} />
                  ) : (
                    <p role="status">{row.error.message}</p>
                  )}
                </div>
              </details>
            );
          }}
        />
      </>
    );
  const rows =
    'diagnostics' in result
      ? result.diagnostics
      : 'tokens' in result
        ? result.tokens
        : 'segments' in result
          ? result.segments
          : [];
  return (
    <div className="space-y-3">
      {'encoding' in result && (
        <div className="rounded-lg bg-muted p-3">
          <p>
            Encoding evidence: <strong>{result.encoding}</strong>
          </p>
          <p className="text-sm">
            Confidence:{' '}
            {result.confidence === null
              ? 'No strong signal'
              : result.confidence.toFixed(4)}
            . This is encoding evidence, not correctness.
          </p>
        </div>
      )}
      {'valid' in result && (
        <p>
          {result.valid
            ? 'No supported structural diagnostics found.'
            : 'Structural issues detected.'}{' '}
          This is not spelling or meaning validation.
        </p>
      )}
      {'mixedScript' in result && (
        <p>
          Recognized scripts: {result.scripts.join(', ') || 'none'} · Mixed
          script: {String(result.mixedScript)}
        </p>
      )}
      {'complete' in result && (
        <p className={result.complete ? '' : 'text-amber-800'}>
          Transliteration:{' '}
          {result.complete
            ? 'complete for supported mappings'
            : 'incomplete; inspect unsupported segments'}
        </p>
      )}
      {'changed' in result && (
        <p>
          {result.changed
            ? 'Output differs from original.'
            : 'Output is unchanged.'}
        </p>
      )}
      {'output' in result && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Output</h3>
          <pre
            className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-4 leading-8"
            dir="auto"
          >
            <bdi>{visibleText(result.output)}</bdi>
          </pre>
        </div>
      )}
      {span && span.input === result.input && (
        <Highlight text={result.input} start={span.start} end={span.end} />
      )}
      <PageRows
        rows={rows}
        render={(value) => {
          const row = value as {
            start: number;
            end: number;
            text?: string;
            input?: string;
            output?: string;
            kind?: string;
            code?: string;
            message?: string;
            encoding?: string;
            zawgyiProbability?: number | null;
            script?: string;
          };
          return (
            <button
              type="button"
              className="w-full rounded-lg border p-3 text-left text-sm hover:bg-muted focus-visible:outline-primary"
              onClick={() => setSpan({ ...row, input: result.input })}
            >
              <span className="flex justify-between gap-2">
                <strong>{row.code ?? row.kind ?? row.encoding}</strong>
                <code>
                  [{row.start}, {row.end})
                </code>
              </span>
              <bdi className="mt-1 block leading-7">
                {visibleText(row.text ?? row.input ?? '')}
                {row.output !== undefined && ` → ${visibleText(row.output)}`}
              </bdi>
              {row.message && <span className="block">{row.message}</span>}
              {row.zawgyiProbability !== undefined && (
                <span className="block text-xs">
                  Zawgyi probability:{' '}
                  {row.zawgyiProbability === null
                    ? 'no signal'
                    : row.zawgyiProbability.toFixed(4)}
                </span>
              )}
              {row.script && (
                <span className="text-xs">Script: {row.script}</span>
              )}
            </button>
          );
        }}
      />
      {!!rows.length && (
        <p className="text-xs text-muted-foreground">
          Select a row to highlight its span in the exact analyzed input.
          Offsets are half-open code-point offsets.
        </p>
      )}
    </div>
  );
}
function UnicodeInspector({ text }: { text: string }) {
  const points = Array.from(text);
  return (
    <>
      <p className="mb-3 text-sm">
        {points.length.toLocaleString()} code points. Control characters are
        escaped.
      </p>
      <PageRows
        rows={points}
        render={(value, index) => (
          <div className="grid grid-cols-3 gap-3 rounded-md border px-3 py-2 font-mono text-sm">
            <span>{index}</span>
            <span>
              <bdi>{visibleText(String(value))}</bdi>
            </span>
            <span>
              U+
              {String(value)
                .codePointAt(0)!
                .toString(16)
                .toUpperCase()
                .padStart(4, '0')}
            </span>
          </div>
        )}
      />
    </>
  );
}
function Comparison({ input, output }: { input: string; output: string }) {
  const [comparison, setComparison] = useState<TextComparison | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const runner = new LocalRunner(
      () =>
        new Worker(
          new URL('../../lib/playground/engine.worker.ts', import.meta.url),
          { type: 'module' },
        ),
    );
    runner
      .compare(input, output)
      .then((value) => {
        if (active) setComparison(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      runner.cancel();
    };
  }, [input, output]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['Original', input],
          ['Output', output],
        ].map(([label, text]) => (
          <div key={label}>
            <h3 className="mb-2 text-sm font-medium">{label}</h3>
            <pre
              className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border p-3 leading-8"
              dir="auto"
            >
              <bdi>{visibleText(text!)}</bdi>
            </pre>
          </div>
        ))}
      </div>
      {comparison?.limited ? (
        <p className="text-sm">
          Detailed comparison is disabled above 20,000 combined code points.
          Full text is available for download.
        </p>
      ) : comparison ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Common prefix/suffix and the changed middle region:
          </p>
          <p className="whitespace-pre-wrap break-words rounded-lg bg-muted p-3 leading-8">
            <bdi>
              {visibleText(comparison.prefix)}
              <del className="bg-red-100 text-red-900">
                {visibleText(comparison.removed)}
              </del>
              <ins className="bg-emerald-100 text-emerald-900">
                {visibleText(comparison.added)}
              </ins>
              {visibleText(comparison.suffix)}
            </bdi>
          </p>
        </div>
      ) : (
        <p role="status">
          {failed
            ? 'Detailed comparison unavailable. Original and output remain available.'
            : 'Computing comparison locally…'}
        </p>
      )}
    </div>
  );
}
export function ResultView({
  run,
  stale,
  onApply,
}: {
  run: Run | null;
  stale: boolean;
  onApply: (text: string) => void;
}) {
  const [unicodeSource, setUnicodeSource] = useState('input');
  const [notice, setNotice] = useState('');
  if (!run)
    return (
      <div className="flex min-h-80 flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
        <h2 className="font-medium">Inspect your next result</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Choose an operation and run it. Local processing keeps submitted text
          in this browser.
        </p>
      </div>
    );
  const result = run.result;
  const text =
    result && 'input' in result
      ? result.input
      : 'text' in run.request.payload
        ? run.request.payload.text
        : '';
  const output = result && 'output' in result ? result.output : null;
  const json = JSON.stringify(result ?? run.error, null, 2);
  return (
    <div className="space-y-4">
      {stale && (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Stale result: input, options, mode or project changed. This result
          belongs to its recorded request.
        </p>
      )}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{run.mode === 'local' ? 'Local engine' : 'API execution'}</span>
        <span>{run.elapsedMs.toFixed(1)} ms</span>
        {run.httpStatus && <span>HTTP {run.httpStatus}</span>}
        {run.requestId && <span>Request: {run.requestId}</span>}
      </div>
      <p className="break-all font-mono text-xs">
        Build: {run.build}
        <br />
        Profiles: {run.profiles.join(', ') || 'none'}
      </p>
      {run.error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <strong>{run.error.code}</strong>
          <p className="mt-1">{run.error.message}</p>
        </div>
      ) : (
        result && (
          <Tabs defaultValue="readable">
            <TabsList className="max-w-full overflow-x-auto">
              <TabsTrigger value="readable">Result</TabsTrigger>
              <TabsTrigger value="comparison" disabled={output === null}>
                Compare
              </TabsTrigger>
              <TabsTrigger value="unicode" disabled={'results' in result}>
                Unicode
              </TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
            <TabsContent value="readable">
              <Readable key={JSON.stringify(run.request)} result={result} />
            </TabsContent>
            <TabsContent value="comparison">
              {output !== null && (
                <Comparison
                  key={JSON.stringify([text, output])}
                  input={text}
                  output={output}
                />
              )}
            </TabsContent>
            <TabsContent value="unicode">
              <label className="mb-3 block text-sm">
                Inspect{' '}
                <select
                  className="ml-2 rounded-md border p-1"
                  value={unicodeSource}
                  onChange={(event) => setUnicodeSource(event.target.value)}
                >
                  <option value="input">Analyzed input</option>
                  {output !== null && <option value="output">Output</option>}
                </select>
              </label>
              <UnicodeInspector
                text={
                  unicodeSource === 'output' && output !== null ? output : text
                }
              />
            </TabsContent>
            <TabsContent value="json">
              <pre className="max-h-[32rem] overflow-auto rounded-lg bg-muted p-3 text-xs">
                {json.slice(0, 64_000)}
                {json.length > 64_000
                  ? '\n… Preview limited; download the full result.'
                  : ''}
              </pre>
            </TabsContent>
          </Tabs>
        )
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard
              .writeText(output ?? json)
              .then(() => setNotice('Copied.'))
              .catch(() =>
                setNotice(
                  'Clipboard unavailable. Download the result instead.',
                ),
              );
          }}
        >
          Copy {output !== null ? 'output' : 'JSON'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            downloadJson('myanlex-result.json', result ?? run.error)
          }
        >
          Download full result
        </Button>
        {output !== null && (
          <Button
            variant="outline"
            size="sm"
            disabled={stale}
            onClick={() => onApply(output)}
          >
            Apply output to editor
          </Button>
        )}
      </div>
      <p role="status" className="text-xs">
        {notice}
      </p>
    </div>
  );
}
