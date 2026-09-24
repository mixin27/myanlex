import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { URL } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';
import {
  firstResponse,
  languageExamples,
} from '../examples/http/contract-cases.ts';

process.env.NODE_ENV = 'test';
process.env.AUTH_ENABLED = 'false';
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
createRequire(new URL('../apps/api/package.json', import.meta.url))(
  'reflect-metadata',
);
const { createApiApplication } =
  await import('../apps/api/dist/create-api-application.js');
const apiKey = randomUUID();
const app = await createApiApplication({
  apiKey,
  logger: false,
  quotasEnabled: false,
  rateLimitMaxRequests: 100,
});
const run = promisify(execFile);
try {
  await app.listen(0, '127.0.0.1');
  const baseUrl = `${await app.getUrl()}/v1`;
  for (const example of languageExamples) {
    const response = await globalThis.fetch(`${baseUrl}${example.path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(example.body),
      signal: globalThis.AbortSignal.timeout(10_000),
    });
    assert.equal(response.status, 200, example.path);
    const result = await response.json();
    if (example.path === '/syllabify') assert.deepEqual(result, firstResponse);
    if (example.path === '/transliterate')
      assert.equal(result.output, 'mranʻmā');
    if (example.path === '/batch/syllabify') {
      assert.equal(result.results[0].success, true);
      assert.equal(result.results[1].error.code, 'invalid_unicode');
    }
  }
  const env = {
    ...process.env,
    MYANLEX_API_KEY: apiKey,
    MYANLEX_API_URL: baseUrl,
  };
  for (const [command, args] of [
    ['sh', ['examples/http/quick-start.sh']],
    [process.execPath, ['examples/http/quick-start.mjs']],
    ['python3', ['examples/http/quick-start.py']],
  ]) {
    const { stdout } = await run(command, args, { env, timeout: 40_000 });
    assert.deepEqual(JSON.parse(stdout), firstResponse);
    await assert.rejects(
      run(command, args, {
        env: { ...env, MYANLEX_API_KEY: 'invalid' },
        timeout: 40_000,
      }),
    );
  }
  const { stdout } = await run(
    'pnpm',
    ['exec', 'tsx', 'packages/sdk/examples/quick-start.ts'],
    { env, timeout: 40_000 },
  );
  assert.ok(stdout.includes('မြန်'));
  await assert.rejects(
    run('pnpm', ['exec', 'tsx', 'packages/sdk/examples/quick-start.ts'], {
      env: { ...env, MYANLEX_API_KEY: 'invalid' },
      timeout: 40_000,
    }),
  );
  log(
    'Documentation smoke passed: nine request bodies, exact first response, four runnable examples and rejected credentials.',
  );
} finally {
  await app.close();
}
