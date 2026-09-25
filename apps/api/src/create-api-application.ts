import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { ConsoleLogger } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { configureAccountAuth } from './modules/account-auth/account-auth.routes.js';
import { configureApiDocumentation } from './common/docs/api-documentation.js';
import { configureHttpSecurity } from './common/http/http-security.js';
import { configureRequestObservability } from './common/http/request-observability.js';
import type { RequestLogSink } from './common/http/request-observability.js';
import { MetricsService } from './modules/operations/metrics.service.js';
import { configureMetricsRoute } from './modules/operations/metrics.routes.js';

export interface CreateApiApplicationOptions {
  readonly metricsToken?: string;
  readonly apiKey?: string;
  readonly databaseUrl?: string;
  readonly logger?: false;
  readonly requestLogSink?: RequestLogSink;
  readonly rateLimitMaxRequests?: number;
  readonly rateLimitWindowMs?: number;
  readonly serviceVersion?: string;
  readonly redisUrl?: string;
  readonly redisPrefix?: string;
  readonly quotasEnabled?: boolean;
}

export async function createApiApplication(
  options: CreateApiApplicationOptions = {},
): Promise<NestFastifyApplication> {
  const application = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(options),
    new FastifyAdapter({
      bodyLimit: 1_048_576,
      requestIdHeader: false,
      genReqId: () => randomUUID(),
      logger: false,
      trustProxy: false,
      requestTimeout: 30_000,
    }),
    {
      logger:
        options.logger === false ? false : new ConsoleLogger({ json: true }),
    },
  );

  application.setGlobalPrefix('v1');
  const metrics = application.get(MetricsService);
  configureRequestObservability(
    application,
    options.requestLogSink ?? (options.logger === false ? () => {} : undefined),
    (record) => metrics.observe(record),
  );
  await configureHttpSecurity(application);
  configureMetricsRoute(application);
  configureAccountAuth(application);
  configureApiDocumentation(application);
  application.enableShutdownHooks();
  await application.init();
  await application.getHttpAdapter().getInstance().ready();

  return application;
}
