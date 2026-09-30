import assert from 'node:assert/strict';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import {
  command,
  preparePackages,
  root,
  sha256,
  writeJson,
} from './package-release.mjs';
import { localSuite } from './fixtures/package-consumer/local-suite.mjs';

const browserName = process.env.MYANLEX_TEST_BROWSER ?? 'chromium';
assert.ok(
  ['chromium', 'firefox', 'webkit'].includes(browserName),
  'Unsupported test browser',
);
const prepared = preparePackages();
const temporary = realpathSync(
  mkdtempSync(join(tmpdir(), 'myanlex-package-consumer-')),
);
const consumer = join(temporary, 'consumer');
const artifacts = join(temporary, 'artifacts');
mkdirSync(consumer);
mkdirSync(artifacts);
const dependencies = {};
for (const pkg of prepared.manifest.packages) {
  const archive = join(artifacts, pkg.filename);
  cpSync(join(prepared.artifacts, pkg.filename), archive);
  assert.equal(sha256(readFileSync(archive)), pkg.sha256);
  dependencies[pkg.name] = 'file:../artifacts/' + pkg.filename;
}
writeJson(join(consumer, 'package.json'), {
  name: 'isolated-consumer',
  private: true,
  type: 'module',
  dependencies,
});
process.stdout.write(
  command(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--cache',
      join(temporary, 'npm-cache'),
    ],
    consumer,
  ) + '\n',
);
cpSync(join(root, 'scripts/fixtures/package-consumer'), consumer, {
  recursive: true,
});
const application = await import(
  pathToFileURL(join(root, 'packages/application/dist/index.js'))
);
const core = await import(
  pathToFileURL(join(root, 'packages/core/dist/index.js'))
);
const expected = localSuite(application, core);
writeJson(join(consumer, 'expected.json'), expected);
// Check both common consumer module-resolution modes without installing development tools there.
for (const resolution of ['NodeNext', 'Bundler']) {
  writeJson(join(consumer, 'tsconfig.json'), {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM'],
      module: resolution === 'NodeNext' ? 'NodeNext' : 'ESNext',
      moduleResolution: resolution,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: [],
    },
    files: ['probe.ts'],
  });
  command(
    process.execPath,
    [
      join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      join(consumer, 'tsconfig.json'),
    ],
    consumer,
  );
}
process.stdout.write(
  command(process.execPath, [join(consumer, 'node.mjs')], consumer) + '\n',
);
const bundle = await build({
  absWorkingDir: consumer,
  entryPoints: ['worker.mjs'],
  outfile: 'worker.bundle.js',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  metafile: true,
});
for (const input of Object.keys(bundle.metafile.inputs)) {
  const path = realpathSync(join(consumer, input));
  assert.ok(
    !relative(consumer, path).startsWith('..'),
    'Browser bundle resolved outside isolated consumer',
  );
}
writeFileSync(
  join(consumer, 'index.html'),
  `<!doctype html><title>Package compatibility fixture</title><script>
globalThis.workerReady = new Promise((resolve, reject) => {
  const worker = new Worker('./worker.bundle.js', { type: 'module' });
  const deadline = setTimeout(() => reject(new Error('Worker loading deadline exceeded')), 30000);
  worker.onerror = reject;
  worker.onmessage = (event) => { if (event.data.ready) { clearTimeout(deadline); resolve(worker); } };
});
</script>`,
);
const server = createServer((request, response) => {
  const file =
    request.url === '/'
      ? 'index.html'
      : request.url === '/worker.bundle.js'
        ? 'worker.bundle.js'
        : null;
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.setHeader(
    'Content-Type',
    file.endsWith('.js') ? 'text/javascript' : 'text/html',
  );
  response.end(readFileSync(join(consumer, file)));
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  browser = await { chromium, firefox, webkit }[browserName].launch();
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:' + server.address().port);
  await page.evaluate(() => globalThis.workerReady.then(() => true));
  await context.setOffline(true);
  const requests = [];
  context.on('request', (request) => requests.push(request.url()));
  const actual = await page.evaluate(() =>
    Promise.race([
      globalThis.workerReady.then(
        (worker) =>
          new Promise((resolve, reject) => {
            worker.onmessage = (event) =>
              event.data.error
                ? reject(new Error(event.data.error))
                : resolve(event.data.result);
            worker.onerror = reject;
            worker.postMessage('execute');
          }),
      ),
      new Promise((_, reject) =>
        globalThis.setTimeout(
          () => reject(new Error('Offline worker deadline exceeded')),
          30_000,
        ),
      ),
    ]),
  );
  assert.deepEqual(actual, expected);
  assert.deepEqual(requests, [], 'Processing attempted network access');
  writeJson(join(prepared.artifacts, 'verification.json'), {
    format: 'myanlex-package-verification-v1',
    sourceCommit: prepared.manifest.sourceCommit,
    dirty: prepared.manifest.dirty,
    node: process.version,
    browser: browserName,
    browserVersion: browser.version(),
    packages: prepared.manifest.packages.map(({ name, sha256 }) => ({
      name,
      sha256,
    })),
    checks: [
      'offline-install',
      'isolated-esm',
      'nodenext-types',
      'bundler-types',
      'nine-operation-parity',
      'guarded-errors',
      'partial-batch-failures',
      'limits',
      'http-sdk-no-fallback',
      'offline-loaded-browser-worker',
    ],
  });
  process.stdout.write(
    `${browserName}: offline installed-package worker parity passed.\nEvidence: ${prepared.artifacts}\nTemporary consumer retained for inspection: ${temporary}\n`,
  );
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
