import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { fromNodeHeaders } from 'better-auth/node';

import { AccountAuthService } from './account-auth.service.js';

// Better Auth owns these routes and validates sessions, origins and OAuth state.
// They are intentionally outside the NLP bearer-key guard and /v1 contract.
export function configureAccountAuth(
  application: NestFastifyApplication,
): void {
  const service = application.get(AccountAuthService);
  const server = application.getHttpAdapter().getInstance();
  server.get('/api/auth/providers', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { enabled: Boolean(service.auth), providers: service.providers };
  });
  server.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    bodyLimit: 16_384,
    handler: async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!service.auth || !service.publicURL) {
        return reply
          .code(503)
          .send({ message: 'Account authentication is not configured.' });
      }
      if (
        request.method === 'POST' &&
        request.headers.origin !== service.publicURL
      ) {
        return reply
          .code(403)
          .send({ message: 'A trusted origin is required.' });
      }
      const headers = fromNodeHeaders(request.headers);
      headers.set('x-myanlex-client-ip', request.ip);
      const response = await service.auth.handler(
        new Request(new URL(request.url, service.publicURL), {
          method: request.method,
          headers,
          ...(request.method === 'POST' && request.body !== undefined
            ? { body: JSON.stringify(request.body) }
            : {}),
        }),
      );
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.code(response.status).send(await response.text());
    },
  });
}
