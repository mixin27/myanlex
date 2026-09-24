import process from 'node:process';
import { URL } from 'node:url';
import { log, error } from 'node:console';

// Server-side only; never place a long-lived key in a browser bundle.
try {
  const key = process.env.MYANLEX_API_KEY;
  const base = new URL(
    process.env.MYANLEX_API_URL ?? 'http://localhost:3001/v1',
  );
  if (
    !key ||
    /[^\x21-\x7e]/u.test(key) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    (base.protocol !== 'https:' &&
      !(
        base.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
      ))
  ) {
    throw new Error('Invalid configuration');
  }
  const response = await globalThis.fetch(
    `${base.href.replace(/\/$/u, '')}/syllabify`,
    {
      method: 'POST',
      redirect: 'error',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: 'က😀' }),
      signal: globalThis.AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    error(`MyanLex returned HTTP ${response.status}. No retry was attempted.`);
    process.exitCode = 1;
  } else {
    log(JSON.stringify(await response.json()));
  }
} catch {
  error(
    'Request failed. Check MYANLEX_API_KEY, MYANLEX_API_URL and connectivity.',
  );
  process.exitCode = 1;
}
