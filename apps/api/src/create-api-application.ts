import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

export interface CreateApiApplicationOptions {
  readonly apiKey?: string;
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
  application.enableShutdownHooks();
  await application.init();
  await application.getHttpAdapter().getInstance().ready();

  return application;
}
