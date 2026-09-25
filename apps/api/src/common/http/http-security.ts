import helmet from '@fastify/helmet';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

export async function configureHttpSecurity(
  application: NestFastifyApplication,
): Promise<void> {
  await application.register(helmet, {
    contentSecurityPolicy: false,
    // HTTPS termination and domain-wide HSTS belong to the deployment edge.
    strictTransportSecurity: false,
    xFrameOptions: { action: 'deny' },
  });
  const server = application.getHttpAdapter().getInstance();
  server.addHook('onRequest', (_request, reply, done) => {
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    // Scalar/Swagger load scripts. Do not impose a global unsafe-inline policy.
    reply.header(
      'Content-Security-Policy',
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    done();
  });
  server.addHook('onSend', (_request, reply, _payload, done) => {
    const contentType = String(reply.getHeader('content-type') ?? '');
    if (contentType.includes('json')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      );
      // Responses may contain submitted text, key material or account data.
      reply.header('Cache-Control', 'private, no-store');
    }
    done();
  });
}
