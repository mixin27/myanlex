import { readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';

import { apiReference } from '@scalar/nestjs-api-reference';
import type { OpenAPIObject } from '@nestjs/swagger';
import { SwaggerModule } from '@nestjs/swagger';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { parse } from 'yaml';
import { z } from 'zod';

const openApiDocumentPath = new URL(
  '../../../../../openapi/openapi.yaml',
  import.meta.url,
);

const openApiDocumentSchema = z
  .object({
    openapi: z.string().min(1),
    info: z.object({ title: z.string().min(1), version: z.string().min(1) }),
    paths: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export function loadOpenApiDocument(): OpenAPIObject {
  const source = readFileSync(openApiDocumentPath, 'utf8');
  return openApiDocumentSchema.parse(parse(source)) as unknown as OpenAPIObject;
}

export function configureApiDocumentation(
  application: NestFastifyApplication,
): void {
  const document = loadOpenApiDocument();

  SwaggerModule.setup('swagger', application, document, {
    jsonDocumentUrl: 'openapi.json',
    yamlDocumentUrl: 'openapi.yaml',
  });

  const scalar = apiReference({
    url: '/openapi.json',
    withFastify: true,
    theme: 'default',
    telemetry: false,
    authentication: { preferredSecurityScheme: 'bearerApiKey' },
    metaData: {
      title: 'MyanLex API Reference',
      description: 'Interactive documentation for the MyanLex API.',
    },
  }) as (
    request: Parameters<ReturnType<typeof apiReference>>[0],
    response: ServerResponse,
  ) => void;
  // A native route runs the security/logging hooks before Scalar writes HTML.
  application
    .getHttpAdapter()
    .getInstance()
    .get('/docs', (request, reply) => {
      for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
      }
      reply.hijack();
      scalar(request, reply.raw);
    });
}
