import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';

import { ApplicationModule } from './common/application/application.module.js';
import { AuthModule } from './common/auth/auth.module.js';
import { ErrorsModule } from './common/errors/errors.module.js';
import { RuntimeConfigModule } from './common/runtime/runtime-config.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { OrthographyModule } from './modules/orthography/orthography.module.js';
import { SyllabifyModule } from './modules/syllabify/syllabify.module.js';
import { TextModule } from './modules/text/text.module.js';
import { TokenizeModule } from './modules/tokenize/tokenize.module.js';
import { TransliterateModule } from './modules/transliterate/transliterate.module.js';

export interface ApiModuleOptions {
  readonly apiKey: string;
  readonly serviceVersion: string;
}

@Module({})
export class AppModule {
  static register(options: ApiModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        RuntimeConfigModule.register(options),
        ApplicationModule,
        AuthModule,
        ErrorsModule,
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
