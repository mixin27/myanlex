'use client';

import type { Operation } from '@myanlex/playground';
import { examples } from '@myanlex/playground';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditorRow {
  id: string;
  text: string;
}
export function InputEditor({
  operation,
  text,
  setText,
  rows,
  setRows,
  from,
  to,
  setFrom,
  setTo,
  guarded,
  setGuarded,
}: {
  operation: Operation;
  text: string;
  setText: (text: string) => void;
  rows: EditorRow[];
  setRows: (rows: EditorRow[]) => void;
  from: 'unicode' | 'zawgyi';
  to: 'unicode' | 'zawgyi';
  setFrom: (value: 'unicode' | 'zawgyi') => void;
  setTo: (value: 'unicode' | 'zawgyi') => void;
  guarded: boolean;
  setGuarded: (value: boolean) => void;
}) {
  const batch = operation.startsWith('batch_');
  return (
    <div className="space-y-4">
      {operation === 'convert' && (
        <fieldset className="rounded-xl border p-3">
          <legend className="px-1 text-sm font-medium">
            Conversion options
          </legend>
          <div className="flex gap-3">
            {(['from', 'to'] as const).map((key) => (
              <label key={key} className="flex-1 text-sm">
                {key === 'from' ? 'Source' : 'Target'}
                <select
                  className="mt-1 block w-full rounded-md border bg-background p-2"
                  value={key === 'from' ? from : to}
                  onChange={(event) =>
                    (key === 'from' ? setFrom : setTo)(
                      event.target.value as 'unicode' | 'zawgyi',
                    )
                  }
                >
                  <option value="unicode">Unicode</option>
                  <option value="zawgyi">Zawgyi</option>
                </select>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={guarded}
              onChange={(event) => {
                if (
                  event.target.checked ||
                  window.confirm(
                    'Unchecked conversion may alter mixed, uncertain or incorrectly labeled input. Keep the original. Continue without source validation?',
                  )
                )
                  setGuarded(event.target.checked);
              }}
            />
            <span>Validate source before converting (recommended)</span>
          </label>
          {!guarded && (
            <p className="mt-2 text-sm text-amber-800">
              Unchecked conversion acknowledged. Review input and preserve the
              original.
            </p>
          )}
        </fieldset>
      )}
      {(operation === 'transliterate' ||
        operation === 'batch_transliterate') && (
        <p className="text-sm text-muted-foreground">Scheme: ALA-LC 2011</p>
      )}
      {batch ? (
        <>
          <p className="text-sm text-muted-foreground">
            {rows.length} / 1,000 rows. Each row keeps a stable ID. Inspect
            failures individually.
          </p>
          <div className="max-h-[32rem] space-y-3 overflow-auto">
            {rows.map((row, index) => (
              <fieldset key={row.id} className="rounded-xl border p-3">
                <legend className="px-1 text-xs">Row {index + 1}</legend>
                <div className="mb-2 flex gap-2">
                  <Input
                    aria-label={`ID for row ${index + 1}`}
                    value={row.id}
                    maxLength={120}
                    readOnly
                  />
                  <Button
                    variant="ghost"
                    disabled={rows.length === 1}
                    onClick={() => setRows(rows.filter((_, i) => i !== index))}
                    aria-label={`Remove row ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>
                <textarea
                  aria-label={`Text for row ${index + 1}`}
                  className="min-h-24 w-full resize-y rounded-md border bg-background p-3 leading-8"
                  value={row.text}
                  onChange={(event) =>
                    setRows(
                      rows.map((item, i) =>
                        i === index
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </fieldset>
            ))}
          </div>
          <Button
            variant="outline"
            disabled={rows.length >= 1000}
            onClick={() =>
              setRows([...rows, { id: crypto.randomUUID(), text: '' }])
            }
          >
            Add row
          </Button>
        </>
      ) : (
        <>
          <label htmlFor="playground-input" className="text-sm font-medium">
            Original text
          </label>
          <textarea
            id="playground-input"
            spellCheck={false}
            className="min-h-72 w-full resize-y rounded-xl border bg-background p-4 text-base leading-9 focus-visible:outline-primary"
            placeholder="Paste Myanmar text, or choose an example below…"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {Array.from(text).length.toLocaleString()} / 100,000 Unicode code
            points
          </p>
          <div className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <Button
                key={example.name}
                variant="outline"
                size="sm"
                title={example.provenance}
                onClick={() => setText(example.text)}
              >
                {example.name}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Examples are project-authored synthetic text, MIT licensed.
          </p>
        </>
      )}
    </div>
  );
}
