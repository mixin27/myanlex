import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import process from 'node:process';
import { log } from 'node:console';
import { MyanLex, MyanLexApiError } from '../packages/sdk/dist/index.js';

// Never load developer .env files during this self-contained smoke test.
process.env.NODE_ENV = 'test';
process.env.AUTH_ENABLED = 'false';
delete process.env.DATABASE_URL;
delete process.env.REDIS_URL;
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
require('reflect-metadata');
const { createApiApplication } =
  await import('../apps/api/dist/create-api-application.js');
const apiKey = randomUUID();
const app = await createApiApplication({
  apiKey,
  logger: false,
  quotasEnabled: false,
  rateLimitMaxRequests: 10,
  rateLimitWindowMs: 60_000,
});
try {
  await app.listen(0, '127.0.0.1');
  const client = new MyanLex({ apiKey, baseUrl: `${await app.getUrl()}/v1` });
  assert.equal((await client.health()).status, 'ok');
  assert.equal(
    (await client.detect({ text: 'မြန်မာ' })).profile,
    'zawgyi-unicode-v1',
  );
  assert.equal((await client.normalize({ text: 'က😀' })).output, 'က😀');
  assert.equal(
    (await client.convert({ text: 'က', from: 'unicode', to: 'unicode' }))
      .output,
    'က',
  );
  assert.equal(
    (await client.syllabify({ text: 'က😀' })).segments.at(-1).end,
    2,
  );
  assert.equal((await client.validateOrthography({ text: 'က' })).valid, true);
  assert.equal(
    (await client.transliterate({ text: 'က', scheme: 'ala-lc-2011' })).scheme,
    'ala-lc-2011',
  );
  assert.equal((await client.tokenize({ text: 'က😀' })).tokens.at(-1).end, 2);
  const batch = await client.batchSyllabify({
    items: [
      { id: 'good', text: 'က' },
      { id: 'bad', text: '\ud800' },
    ],
  });
  assert.deepEqual(
    batch.results.map((item) => item.success),
    [true, false],
  );
  assert.equal(
    (
      await client.batchTransliterate({
        items: [{ id: 'a', text: 'က' }],
        scheme: 'ala-lc-2011',
      })
    ).results[0].success,
    true,
  );
  await assert.rejects(
    client.normalize({ text: 123 }),
    (error) => error instanceof MyanLexApiError && error.status === 400,
  );
  await assert.rejects(
    client.normalize({ text: 'က' }),
    (error) =>
      error instanceof MyanLexApiError &&
      error.status === 429 &&
      error.code === 'rate_limited' &&
      error.retryAfterSeconds > 0,
  );
  log(
    'SDK smoke test passed against all nine NestJS language routes, validation and rate limiting.',
  );
} finally {
  await app.close();
}
