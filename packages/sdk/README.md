# @myanlex/sdk

Thin, typed ESM client for the MyanLex HTTP language API. Uses native `fetch`;
the only package dependency is `@myanlex/types`. It does not bundle the language
engine, NestJS, Prisma, or authentication frameworks.

This package is currently developed in this pnpm workspace; this milestone does
not publish it to npm. Use a `workspace:*` dependency in another workspace
package and build with `pnpm --filter @myanlex/sdk build` before importing its
public entry. Use the repository's supported Node.js versions with native fetch.
TypeScript consumers need Node fetch types (`@types/node`) or the DOM library in
browser projects. Keep long-lived API keys on your server, never in browser
bundles, mobile applications, or `NEXT_PUBLIC_*` environment variables.

## Quick start

```ts
import { MyanLex, MyanLexApiError } from '@myanlex/sdk';

const client = new MyanLex({
  apiKey: process.env.MYANLEX_API_KEY!,
  baseUrl: 'http://localhost:3001/v1',
  timeoutMs: 30_000,
});

try {
  const result = await client.syllabify({ text: 'မြန်မာစာ' });
  console.log(result.segments);
} catch (error) {
  if (error instanceof MyanLexApiError) {
    console.error(error.status, error.code, error.requestId);
  } else {
    throw error;
  }
}
```

`baseUrl` includes the API version and defaults to the URL declared in OpenAPI,
`https://api.myanlex.dev/v1`; that default is not a promise of hosted
availability. Self-hosted callers should set it explicitly. Trailing slashes are
accepted; reverse-proxy path prefixes are preserved. HTTPS is required except on
loopback. Credentials, query strings, and fragments in the URL are rejected.
Redirects are disabled and cookies are omitted. An injected `fetch` must honor
these options and `AbortSignal`; transport safety/deadlines cannot be guaranteed
otherwise.

## Operations

All methods return promises of typed JSON results and accept an optional second
argument `{ signal }` for caller cancellation.

| Method                                  | Input                                   |
| --------------------------------------- | --------------------------------------- |
| `health()`                              | None; no API key is sent                |
| `detect({ text })`                      | Detect only; never converts             |
| `normalize({ text })`                   | Documented safe NFC normalization       |
| `convert({ text, from, to })`           | Explicit `unicode` / `zawgyi` direction |
| `syllabify({ text })`                   | Orthographic syllable spans             |
| `validateOrthography({ text })`         | Diagnostics, not automatic repairs      |
| `transliterate({ text, scheme })`       | Explicit `ala-lc-2011` scheme           |
| `tokenize({ text })`                    | Lossless lexical/script spans           |
| `batchSyllabify({ items })`             | Ordered `{ id, text }` items            |
| `batchTransliterate({ items, scheme })` | Ordered items and explicit scheme       |

Text is serialized as supplied, without normalization, segmentation, or other
local linguistic processing. All returned offsets are **Unicode code points**,
not JavaScript UTF-16 indexes. API validation and limits remain server-owned.
TypeScript result types describe the published contract; this SDK checks the
JSON response envelope, not every nested field at runtime.

```ts
const batch = await client.batchSyllabify({
  items: [
    { id: 'one', text: 'မြန်မာစာ' },
    { id: 'two', text: 'က' },
  ],
});
for (const item of batch.results) {
  if (item.success) console.log(item.result.segments);
  else console.error(item.id, item.error.code);
}
```

Successful batch responses may contain item failures; these do not throw HTTP
errors and the server's order is preserved.

## Errors, deadlines, and retries

- `MyanLexApiError`: non-2xx HTTP status, optional parsed `problem`, `code`,
  `requestId`, and `retryAfterSeconds`. Status comes from HTTP, not an untrusted
  problem field. Unknown problem codes remain strings for forward compatibility.
- `MyanLexRequestError`: `kind` is `aborted`, `timeout`, `transport_failure`, or
  `invalid_response`. HTTP error bodies need not be JSON to preserve their
  status.
- The deadline covers fetch and response-body reading. Abort listeners and
  timers are cleaned up after completion. Constructor configuration errors are
  `TypeError`.
- There are **no automatic retries**. A timeout, disconnect, or server error may
  occur after a quota reservation. Retrying can consume another request. Inspect
  `Retry-After` for 429 responses and make retries an explicit application
  policy.
- Error messages do not include keys, request text, URLs, or raw response
  bodies. `problem` is untrusted server data; do not blindly log it or render it
  as HTML.

Account sessions, signup, organization administration, quota dashboards, and
subscription management are deliberately outside this server API-key SDK.

## Development

From the repository root:

```sh
pnpm --filter @myanlex/sdk test
pnpm sdk:smoke
```

The smoke test builds the SDK/API, starts an ephemeral loopback Nest server,
checks all language routes, and closes it. No hosted API or computer-use tool is
involved. The runnable server example is `examples/quick-start.ts`.
