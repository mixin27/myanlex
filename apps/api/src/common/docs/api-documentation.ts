import { readFileSync } from 'node:fs';

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

  application.use(
    '/docs',
    apiReference({
      url: '/openapi.json',
      withFastify: true,
      theme: 'default',
      telemetry: false,
      authentication: { preferredSecurityScheme: 'bearerApiKey' },
      metaData: {
        title: 'MyanLex API Reference',
        description: 'Interactive documentation for the MyanLex API.',
      },
    }),
  );
}
