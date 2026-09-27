'use client';

import { useState } from 'react';
import type {
  ExecutionRequest,
  Run,
  SnippetLanguage,
} from '@myanlex/playground';
import { reproduction, snippet } from '@myanlex/playground';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { downloadJson } from '@/lib/playground/client';

export function DeveloperTools({
  request,
  run,
}: {
  request: ExecutionRequest;
  run: Run | null;
}) {
  const [language, setLanguage] = useState<SnippetLanguage>('curl');
  const [includeText, setIncludeText] = useState(false);
  const [notice, setNotice] = useState('');
  const code = snippet(request, language);
  return (
    <Tabs defaultValue="code">
      <TabsList>
        <TabsTrigger value="code">Code examples</TabsTrigger>
        <TabsTrigger value="request">Request</TabsTrigger>
        <TabsTrigger value="export">Reproduction</TabsTrigger>
      </TabsList>
      <TabsContent value="code">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            These examples call the HTTP API and require a server-side API key,
            including when the playground run was local. SDKs remain unpublished
            previews; install the matching local package or supplied artifact.
          </p>
          <label className="block text-sm">
            Language{' '}
            <select
              className="ml-2 rounded-md border bg-background p-2"
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as SnippetLanguage)
              }
            >
              <option value="curl">curl</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="python_async">Python async</option>
              <option value="dart">Dart</option>
            </select>
          </label>
          <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-4 text-xs">
            {code.length > 64_000
              ? `${code.slice(0, 64_000)}\n… Preview bounded; copy/download includes all text.`
              : code}
          </pre>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard
                  .writeText(code)
                  .then(() =>
                    setNotice('Code copied. It includes submitted text.'),
                  )
                  .catch(() => setNotice('Clipboard unavailable.'));
              }}
            >
              Copy full example
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson('myanlex-code-example.json', { language, code })
              }
            >
              Download full example
            </Button>
          </div>
          <p role="status" className="text-xs">
            {notice}
          </p>
        </div>
      </TabsContent>
      <TabsContent value="request">
        <p className="mb-2 text-sm">
          The current request uses the public operation’s payload. API mode
          sends it through the project-authorized playground endpoint.
        </p>
        <pre className="max-h-80 overflow-auto rounded-xl bg-muted p-4 text-xs">
          {JSON.stringify(request, null, 2).slice(0, 64_000)}
        </pre>
      </TabsContent>
      <TabsContent value="export">
        <div className="space-y-3">
          <p className="text-sm">
            Export metadata by default. Include original input and full results
            only when selected.
          </p>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeText}
              onChange={(event) => setIncludeText(event.target.checked)}
            />
            Include original text and full results in the downloaded bundle
          </label>
          <Button
            variant="outline"
            disabled={!run}
            onClick={() => {
              if (run)
                downloadJson(
                  'myanlex-reproduction.json',
                  reproduction(run, includeText),
                );
            }}
          >
            Export reproduction
          </Button>
        </div>
      </TabsContent>
    </Tabs>
  );
}
