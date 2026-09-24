import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { URL, fileURLToPath } from 'node:url';
import process from 'node:process';

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
  rateLimitMaxRequests: 10,
  rateLimitWindowMs: 60000,
});
try {
  await app.listen(0, '127.0.0.1');
  const baseUrl = `${await app.getUrl()}/v1`;
  const code = await new Promise((resolve, reject) => {
    const child = spawn('dart', ['run', 'tool/smoke.dart'], {
      cwd: fileURLToPath(new URL('../packages/myanlex_dart', import.meta.url)),
      env: {
        ...process.env,
        MYANLEX_SMOKE_KEY: apiKey,
        MYANLEX_SMOKE_URL: baseUrl,
      },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code !== 0) throw new Error('Dart SDK smoke test failed.');
} finally {
  await app.close();
}
