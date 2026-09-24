import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { log } from 'node:console';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { developerPreview } from '../apps/docs/src/lib/shared.ts';

process.chdir(fileURLToPath(new URL('../apps/docs', import.meta.url)));

const require = createRequire(
  new URL('../apps/docs/package.json', import.meta.url),
);
const next = require('next');
const app = next({
  dev: false,
  dir: fileURLToPath(new URL('../apps/docs', import.meta.url)),
  hostname: '127.0.0.1',
});
const server = createServer(app.getRequestHandler());
try {
  await app.prepare();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path) =>
    globalThis.fetch(`${base}${path}`, {
      signal: globalThis.AbortSignal.timeout(30_000),
    });
  const response = await get('/docs/quick-start');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.equal(html.includes('Developer preview notice'), developerPreview);
  assert.equal(html.includes('not yet publicly available'), developerPreview);
  assert.ok(html.includes('shiki'), 'code must have syntax highlighting');
  assert.ok(html.includes('Copy'), 'code must have copy controls');
  const links = new Set(
    [...html.matchAll(/href="(\/docs[^"#?]*)/g)].map((match) => match[1]),
  );
  assert.ok(links.size >= 8, 'sidebar should expose top-level documentation');
  const manifest = JSON.parse(
    readFileSync('.next/prerender-manifest.json', 'utf8'),
  );
  for (const route of Object.keys(manifest.routes)) {
    if (route.startsWith('/docs')) links.add(route);
  }
  assert.ok(
    links.size >= 40,
    'guides and generated operations must be prerendered',
  );
  for (const link of links) assert.equal((await get(link)).status, 200, link);
  const sdk = await (await get('/docs/sdks/typescript')).text();
  assert.equal(sdk.includes('planned and does not work yet'), developerPreview);
  assert.ok(sdk.includes('@myanlex/sdk'));
  const tabs = await (await get('/docs/sdks/http')).text();
  assert.ok(tabs.includes('role="tablist"'));
  const search = await get('/api/search?query=syllabification');
  assert.equal(search.status, 200);
  const results = await search.json();
  assert.ok(
    Array.isArray(results) && results.length > 0,
    'search must return results',
  );
  const contract = await (await get('/openapi.json')).json();
  assert.ok(contract.paths['/syllabify']);
  assert.ok(contract.paths['/batch/transliterate']);
  assert.equal((await get('/docs/no-such-page')).status, 404);
  log(
    `Docs site smoke passed: ${links.size} linked pages, highlighted code, tabs, preview notices, search, OpenAPI and 404.`,
  );
} catch (error) {
  log(error);
  process.exitCode = 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await app.close();
}
