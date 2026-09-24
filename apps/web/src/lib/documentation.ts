export const documentationUrl = (
  process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:3002'
).replace(/\/+$/, '');
