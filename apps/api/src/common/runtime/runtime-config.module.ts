import { fileURLToPath } from 'node:url';

import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { API_KEY, HTTP_PORT, SERVICE_VERSION } from '../tokens.js';

export interface RuntimeConfigOptions {
  readonly apiKey?: string;
  readonly serviceVersion?: string;
}

const environmentFile = fileURLToPath(
  new URL('../../../.env', import.meta.url),
);

const runtimeEnvironmentSchema = z.object({
  MYANLEX_API_KEY: z.string().trim().min(1),
  MYANLEX_VERSION: z.string().trim().min(1).default('0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;

function validateEnvironment(
  environment: Record<string, unknown>,
  options: RuntimeConfigOptions,
): Record<string, unknown> & RuntimeEnvironment {
  const result = runtimeEnvironmentSchema.safeParse({
    ...environment,
    ...(options.apiKey === undefined
      ? {}
      : { MYANLEX_API_KEY: options.apiKey }),
    ...(options.serviceVersion === undefined
      ? {}
      : { MYANLEX_VERSION: options.serviceVersion }),
  });

  if (!result.success) {
    throw new Error(
      `Invalid API configuration: ${z.prettifyError(result.error)}`,
    );
  }

  return { ...environment, ...result.data };
}

@Global()
@Module({})
export class RuntimeConfigModule {
  static register(options: RuntimeConfigOptions = {}): DynamicModule {
    return {
      module: RuntimeConfigModule,
      imports: [
        ConfigModule.forRoot({
          cache: true,
          envFilePath: environmentFile,
          validate: (environment) => validateEnvironment(environment, options),
        }),
      ],
      providers: [
        {
          provide: API_KEY,
          inject: [ConfigService],
          useFactory: (config: ConfigService): string =>
            config.getOrThrow<string>('MYANLEX_API_KEY'),
        },
        {
          provide: HTTP_PORT,
          inject: [ConfigService],
          useFactory: (config: ConfigService): number =>
            config.getOrThrow<number>('PORT'),
        },
        {
          provide: SERVICE_VERSION,
          inject: [ConfigService],
          useFactory: (config: ConfigService): string =>
            config.getOrThrow<string>('MYANLEX_VERSION'),
        },
      ],
      exports: [API_KEY, HTTP_PORT, SERVICE_VERSION],
    };
  }
}
