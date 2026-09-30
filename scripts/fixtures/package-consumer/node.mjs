import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { URL, fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import process from 'node:process';
import { localSuite } from './local-suite.mjs';

let networkCalls = 0;
const denied = () => {
  networkCalls++;
  throw new Error('Network denied in package test');
};
globalThis.fetch = denied;
http.request =
  http.get =
  https.request =
  https.get =
  net.connect =
  net.createConnection =
    denied;
syncBuiltinESMExports();
const directory = realpathSync(fileURLToPath(new URL('./', import.meta.url)));
for (const name of ['types', 'core', 'application', 'sdk']) {
  const module = fileURLToPath(import.meta.resolve('@myanlex/' + name));
  assert.ok(
    realpathSync(module).startsWith(directory + '/node_modules/'),
    'Workspace resolution leak',
  );
}
const application = await import('@myanlex/application');
const core = await import('@myanlex/core');
const { MyanLex, MyanLexRequestError } = await import('@myanlex/sdk');
const results = localSuite(application, core);
assert.deepEqual(
  results,
  JSON.parse(readFileSync(new URL('./expected.json', import.meta.url), 'utf8')),
);
assert.equal(networkCalls, 0, 'Local engine attempted network access');
assert.equal(results.results[9].error, 'encoding_uncertain');
assert.equal(results.results[10].error, 'invalid_unicode');
assert.equal(results.results[11].error, 'text_too_long');
assert.equal(results.results[7].result.results[1].success, false);
assert.equal(results.results[8].result.results[1].success, false);
assert.equal(results.results[12].result.changed, true);
assert.equal(results.results[13].result.changed, true);
await assert.rejects(
  new MyanLex({
    apiKey: 'fixture-only',
    baseUrl: 'https://api.invalid/v1',
  }).normalize({ text: 'က' }),
  MyanLexRequestError,
);
assert.equal(
  networkCalls,
  1,
  'HTTP SDK must fail explicitly without local fallback or retry',
);
process.stdout.write(
  'Installed ESM/types, all nine local operations, limits and explicit SDK failure passed.\n',
);
