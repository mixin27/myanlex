import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';

import { API_KEY, SERVICE_VERSION } from '../tokens.js';

export interface RuntimeConfigOptions {
  readonly apiKey: string;
  readonly serviceVersion: string;
}

@Global()
@Module({})
export class RuntimeConfigModule {
  static register(options: RuntimeConfigOptions): DynamicModule {
    if (options.apiKey.length === 0) {
      throw new Error('apiKey must not be empty.');
    }

    return {
      module: RuntimeConfigModule,
      providers: [
        { provide: API_KEY, useValue: options.apiKey },
        { provide: SERVICE_VERSION, useValue: options.serviceVersion },
      ],
      exports: [API_KEY, SERVICE_VERSION],
    };
  }
}
