import { MyanLex, MyanLexApiError } from '../src/index.js';

async function main() {
  const apiKey = process.env.MYANLEX_API_KEY;
  if (!apiKey)
    throw new Error('Set MYANLEX_API_KEY in your server environment.');
  const client = new MyanLex({
    apiKey,
    baseUrl: process.env.MYANLEX_API_URL ?? 'http://localhost:3001/v1',
  });
  try {
    const result = await client.syllabify({ text: 'မြန်မာစာ' });
    console.log(result.segments);
  } catch (error) {
    if (error instanceof MyanLexApiError) {
      console.error({
        status: error.status,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      });
      return;
    }
    throw error;
  }
}

void main().catch(() => {
  console.error('Example request failed. Check your API URL and credentials.');
  process.exitCode = 1;
});
