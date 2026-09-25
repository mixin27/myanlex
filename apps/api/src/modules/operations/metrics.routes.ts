import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { MetricsService } from './metrics.service.js';

export function configureMetricsRoute(
  application: NestFastifyApplication,
): void {
  const metrics = application.get(MetricsService);
  if (!metrics.enabled) return;
  // Separate operator credential, outside account/NLP guards and quota usage.
  application
    .getHttpAdapter()
    .getInstance()
    .get('/internal/metrics', async (request, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      if (!metrics.authorize(request.headers.authorization)) {
        reply.header('WWW-Authenticate', 'Bearer');
        return reply
          .code(401)
          .send({ message: 'Operator authentication required.' });
      }
      return reply
        .type(metrics.registry.contentType)
        .send(await metrics.registry.metrics());
    });
}
