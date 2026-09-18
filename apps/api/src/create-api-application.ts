import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { configureAccountAuth } from './modules/account-auth/account-auth.routes.js';
import { configureApiDocumentation } from './common/docs/api-documentation.js';

export interface CreateApiApplicationOptions {
  readonly apiKey?: string;
  readonly databaseUrl?: string;
  readonly logger?: false;
  readonly rateLimitMaxRequests?: number;
  readonly rateLimitWindowMs?: number;
  readonly serviceVersion?: string;
}

export async function createApiApplication(
  options: CreateApiApplicationOptions = {},
): Promise<NestFastifyApplication> {
  const application = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(options),
    new FastifyAdapter({ bodyLimit: 1_048_576 }),
    options.logger === false ? { logger: false } : {},
  );

  application.setGlobalPrefix('v1');
  configureAccountAuth(application);
  configureApiDocumentation(application);
  application.enableShutdownHooks();
  await application.init();
  await application.getHttpAdapter().getInstance().ready();

  return application;
}
