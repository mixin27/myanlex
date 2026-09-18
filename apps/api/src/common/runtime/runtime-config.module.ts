import { fileURLToPath } from 'node:url';

import type { DynamicModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { z } from 'zod';

import {
  API_KEY,
  DATABASE_URL,
  HTTP_PORT,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  SERVICE_VERSION,
} from '../tokens.js';

export interface RuntimeConfigOptions {
  readonly apiKey?: string;
  readonly databaseUrl?: string;
  readonly rateLimitMaxRequests?: number;
  readonly rateLimitWindowMs?: number;
  readonly serviceVersion?: string;
}

const environmentFile = fileURLToPath(
  new URL('../../../.env', import.meta.url),
);

const runtimeEnvironmentSchema = z
  .object({
    DATABASE_URL: z
      .string()
      .trim()
      .refine(
        (value) =>
          value.startsWith('postgresql://') || value.startsWith('postgres://'),
        'DATABASE_URL must be a PostgreSQL connection URL.',
      )
      .optional(),
    MYANLEX_API_KEY: z.string().trim().min(1).optional(),
    MYANLEX_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
    MYANLEX_RATE_LIMIT_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .default(60_000),
    MYANLEX_VERSION: z.string().trim().min(1).default('0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  })
  .superRefine((environment, context) => {
    if (
      environment.DATABASE_URL === undefined &&
      environment.MYANLEX_API_KEY === undefined
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Either DATABASE_URL or MYANLEX_API_KEY must be configured.',
        path: ['DATABASE_URL'],
      });
    }
  });

type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;

function validateEnvironment(
  environment: Record<string, unknown>,
  options: RuntimeConfigOptions,
): Record<string, unknown> & RuntimeEnvironment {
  const result = runtimeEnvironmentSchema.safeParse({
    ...environment,
    ...(options.databaseUrl === undefined
      ? {}
      : { DATABASE_URL: options.databaseUrl }),
    ...(options.apiKey === undefined
      ? {}
      : { MYANLEX_API_KEY: options.apiKey }),
    ...(options.rateLimitMaxRequests === undefined
      ? {}
      : { MYANLEX_RATE_LIMIT_MAX: options.rateLimitMaxRequests }),
    ...(options.rateLimitWindowMs === undefined
      ? {}
      : { MYANLEX_RATE_LIMIT_WINDOW_MS: options.rateLimitWindowMs }),
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
          useFactory: (config: ConfigService): string | undefined =>
            config.get<string>('MYANLEX_API_KEY'),
        },
        {
          provide: DATABASE_URL,
          inject: [ConfigService],
          useFactory: (config: ConfigService): string | undefined =>
            config.get<string>('DATABASE_URL'),
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
        {
          provide: RATE_LIMIT_MAX_REQUESTS,
          inject: [ConfigService],
          useFactory: (config: ConfigService): number =>
            config.getOrThrow<number>('MYANLEX_RATE_LIMIT_MAX'),
        },
        {
          provide: RATE_LIMIT_WINDOW_MS,
          inject: [ConfigService],
          useFactory: (config: ConfigService): number =>
            config.getOrThrow<number>('MYANLEX_RATE_LIMIT_WINDOW_MS'),
        },
      ],
      exports: [
        API_KEY,
        DATABASE_URL,
        HTTP_PORT,
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_MS,
        SERVICE_VERSION,
      ],
    };
  }
}
