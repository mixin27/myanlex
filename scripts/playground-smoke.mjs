import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { TextEncoder, TextDecoder } from 'node:util';
import { performance } from 'node:perf_hooks';
import { log } from 'node:console';
import { setImmediate } from 'node:timers/promises';

const root = new URL('../apps/web/', import.meta.url);
const chunks = new URL('.next/static/chunks/', root);
const scripts = readdirSync(chunks).filter((name) => name.endsWith('.js'));
const bootstrap = scripts.find((name) => name.startsWith('turbopack-worker-'));
assert.ok(bootstrap, 'production worker bootstrap must exist');
const reference = scripts
  .map((name) => readFileSync(new URL(name, chunks), 'utf8'))
  .find((source) => source.includes('default("static/chunks/' + bootstrap));
assert.ok(
  reference,
  'client bundle must reference a compiled worker, not raw TypeScript',
);
const match =
  /default\("static\/chunks\/turbopack-worker-[^"]+",(\[[^\]]+\])/u.exec(
    reference,
  );
assert.ok(match, 'worker chunk manifest must be bundled');
const urls = JSON.parse(match[1]).map((path) => '/_next/' + path);
class WorkerGlobalScope {
  static [Symbol.hasInstance](value) {
    return typeof value?.postMessage === 'function';
  }
}
const scope = Object.assign(new WorkerGlobalScope(), {
  WorkerGlobalScope,
  URL,
  TextEncoder,
  TextDecoder,
  performance,
  console: { error: () => {} },
  location: new URL(
    'http://127.0.0.1/_next/static/chunks/' +
      bootstrap +
      '?params=' +
      encodeURIComponent(JSON.stringify([urls, '', '/_next/', '', ''])),
  ),
});
scope.self = scope;
let result;
scope.postMessage = (value) => {
  result = value;
};
const context = createContext(scope);
scope.importScripts = (...paths) => {
  for (const path of paths) {
    const pathname = new URL(path).pathname;
    assert.ok(pathname.startsWith('/_next/static/'));
    runInContext(
      readFileSync(
        new URL('.next/' + pathname.slice('/_next/'.length), root),
        'utf8',
      ),
      context,
      { timeout: 5000 },
    );
  }
};
runInContext(readFileSync(new URL(bootstrap, chunks), 'utf8'), context, {
  timeout: 5000,
});
await setImmediate();
assert.equal(typeof scope.onmessage, 'function');
scope.onmessage({
  data: {
    type: 'execute',
    request: { operation: 'normalize', payload: { text: 'က😀' } },
  },
});
assert.equal(result.value.mode, 'local');
assert.equal(result.value.result.output, 'က😀');
assert.equal(result.value.result.input, 'က😀');
scope.onmessage({ data: { type: 'compare', input: '😀x', output: '😀y' } });
assert.equal(result.value.prefix, '😀');

const require = createRequire(new URL('package.json', root));
const app = require('next')({
  dev: false,
  dir: fileURLToPath(root),
  hostname: '127.0.0.1',
});
const server = createServer(app.getRequestHandler());
try {
  await app.prepare();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const response = await globalThis.fetch(origin + '/playground', {
    redirect: 'manual',
  });
  assert.equal(
    response.status,
    200,
    'public workbench must not redirect to sign-in',
  );
  const html = await response.text();
  assert.ok(html.includes('Local engine'));
  assert.ok(html.includes('Original text'));
  assert.ok(html.includes('No sign-in or API quota'));
  assert.equal(
    (await globalThis.fetch(origin + '/playground/notices')).status,
    200,
  );
  log(
    'Playground production smoke passed: public page, notices and compiled worker execution/comparison (VM, not a browser).',
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await app.close();
}
