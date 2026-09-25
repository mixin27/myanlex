import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { promisify } from 'node:util';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import process from 'node:process';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('./staging-load.mjs', import.meta.url));
const key = 'synthetic-disposable-test-key';
const base = {
  ...process.env,
  MYANLEX_STAGING_ACK: 'I own this staging target',
  MYANLEX_STAGING_API_KEY: key,
};
async function run(environment) {
  try {
    const result = await execute(process.execPath, [script], {
      env: environment,
      timeout: 15_000,
    });
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}
test('rejects missing authorization, non-loopback HTTP, and URL credentials before sending traffic', async () => {
  for (const env of [
    {
      ...base,
      MYANLEX_STAGING_ACK: '',
      MYANLEX_STAGING_URL: 'https://example.invalid',
    },
    { ...base, MYANLEX_STAGING_URL: 'http://example.invalid' },
    { ...base, MYANLEX_STAGING_URL: 'https://user:password@example.invalid' },
  ]) {
    assert.notEqual((await run(env)).code, 0);
  }
});

test('bounds the request count and validates responses without reporting secrets', async () => {
  let count = 0;
  const server = createServer((request, response) => {
    count += 1;
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    assert.equal(request.url, '/v1/text/normalize');
    request.resume();
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ output: 'က😀'.repeat(100) }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await run({
      ...base,
      MYANLEX_STAGING_URL: `http://127.0.0.1:${server.address().port}`,
    });
    assert.equal(result.code, 0);
    assert.equal(count, 200);
    assert.equal(JSON.parse(result.stdout).statuses[200], 200);
    assert.ok(!result.stdout.includes(key));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('stops on failures and never follows redirects with credentials', async () => {
  for (const status of [429, 302]) {
    let count = 0;
    const server = createServer((request, response) => {
      count += 1;
      assert.notEqual(request.url, '/redirected');
      request.resume();
      response.writeHead(status, {
        'content-type': 'application/json',
        location: '/redirected',
      });
      response.end('{}');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const result = await run({
        ...base,
        MYANLEX_STAGING_URL: `http://127.0.0.1:${server.address().port}`,
      });
      assert.equal(result.code, 1);
      assert.ok(count > 0 && count <= 4);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
});
