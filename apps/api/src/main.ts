import 'reflect-metadata';

import { createApiApplication } from './create-api-application.js';

const apiKey = process.env.MYANLEX_API_KEY;
if (apiKey === undefined || apiKey.length === 0) {
  throw new Error('MYANLEX_API_KEY must be set.');
}

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const application = await createApiApplication({
  apiKey,
  serviceVersion: process.env.MYANLEX_VERSION ?? '0.0.0',
});

await application.listen(port, '0.0.0.0');
