import { resolve } from 'node:path';
import { createOpenAPI } from 'fumadocs-openapi/server';

// Only the checked-in schema is loaded. No user-provided URLs or proxy route.
export const openapi = createOpenAPI({
  input: { myanlex: resolve(process.cwd(), '../../openapi/openapi.yaml') },
});
