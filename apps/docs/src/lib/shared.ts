export const appName = 'MyanLex';
export const docsRoute = '/docs';
export const consoleUrl =
  process.env.NEXT_PUBLIC_CONSOLE_URL ?? 'http://localhost:3000';
export const repositoryUrl = 'https://github.com/mixin27/myanlex';

// Remove the notice at launch only after verifying published packages and URLs.
export const developerPreview = true;
export const previewMessage =
  'Developer preview: the hosted API and npm/pub.dev packages are not yet publicly available. Use a self-hosted deployment and the local SDK setup for now.';
