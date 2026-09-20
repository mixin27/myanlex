import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { AccountAuthModule } from './modules/account-auth/account-auth.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';

import { ApplicationModule } from './common/application/application.module.js';
import { AuthModule } from './common/auth/auth.module.js';
import { ErrorsModule } from './common/errors/errors.module.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { QuotaModule } from './common/quota/quota.module.js';
import { RuntimeConfigModule } from './common/runtime/runtime-config.module.js';
import { UsageModule } from './common/usage/usage.module.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { BatchModule } from './modules/batch/batch.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrthographyModule } from './modules/orthography/orthography.module.js';
import { SyllabifyModule } from './modules/syllabify/syllabify.module.js';
import { TextModule } from './modules/text/text.module.js';
import { TokenizeModule } from './modules/tokenize/tokenize.module.js';
import { TransliterateModule } from './modules/transliterate/transliterate.module.js';

export interface ApiModuleOptions {
  readonly apiKey?: string;
  readonly databaseUrl?: string;
  readonly rateLimitMaxRequests?: number;
  readonly rateLimitWindowMs?: number;
  readonly serviceVersion?: string;
  readonly redisUrl?: string;
  readonly redisPrefix?: string;
  readonly quotasEnabled?: boolean;
}

@Module({})
export class AppModule {
  static register(options: ApiModuleOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RuntimeConfigModule.register(options),
        DatabaseModule,
        AccountAuthModule,
        PlatformModule,
        ApplicationModule,
        AuthModule,
        RateLimitModule,
        QuotaModule,
        UsageModule,
        ErrorsModule,
        BatchModule,
        HealthModule,
        TextModule,
        SyllabifyModule,
        OrthographyModule,
        TransliterateModule,
        TokenizeModule,
      ],
    };
  }
}
