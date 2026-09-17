import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';

export interface CreateApiApplicationOptions {
  readonly apiKey: string;
  readonly logger?: false;
  readonly serviceVersion?: string;
}

export async function createApiApplication({
  apiKey,
  logger,
  serviceVersion = '0.0.0',
}: CreateApiApplicationOptions): Promise<NestFastifyApplication> {
  const application = await NestFactory.create<NestFastifyApplication>(
    AppModule.register({ apiKey, serviceVersion }),
    new FastifyAdapter(),
    logger === false ? { logger: false } : {},
  );

  application.setGlobalPrefix('v1');
  application.enableShutdownHooks();
  await application.init();
  await application.getHttpAdapter().getInstance().ready();

  return application;
}
