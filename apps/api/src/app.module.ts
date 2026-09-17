import { createMyanLexApplication } from '@myanlex/application';
import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';

import { API_KEY, MYANLEX_APPLICATION, SERVICE_VERSION } from './api.tokens.js';
import { ApiKeyGuard } from './auth/api-key.guard.js';
import { BurmeseController } from './controllers/burmese.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { ProcessingController } from './controllers/processing.controller.js';
import { TextController } from './controllers/text.controller.js';
import { ProblemDetailsFilter } from './http/problem-details.filter.js';

export interface ApiModuleOptions {
  readonly apiKey: string;
  readonly serviceVersion: string;
}

@Module({})
export class AppModule {
  static register(options: ApiModuleOptions): DynamicModule {
    if (options.apiKey.length === 0) {
      throw new Error('apiKey must not be empty.');
    }

    return {
      module: AppModule,
      controllers: [
        HealthController,
        TextController,
        BurmeseController,
        ProcessingController,
      ],
      providers: [
        { provide: API_KEY, useValue: options.apiKey },
        { provide: SERVICE_VERSION, useValue: options.serviceVersion },
        { provide: MYANLEX_APPLICATION, useValue: createMyanLexApplication() },
        { provide: APP_GUARD, useClass: ApiKeyGuard },
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
      ],
    };
  }
}
