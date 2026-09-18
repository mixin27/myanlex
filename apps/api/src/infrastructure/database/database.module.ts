import { Global, Module } from '@nestjs/common';

import { DATABASE_URL, PLATFORM_REPOSITORY } from '../../common/tokens.js';
import { DisabledPlatformRepository } from './disabled-platform.repository.js';
import type { PlatformRepository } from './platform-repository.js';
import { PrismaPlatformRepository } from './prisma-platform.repository.js';

@Global()
@Module({
  providers: [
    {
      provide: PLATFORM_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (databaseUrl: string | undefined): PlatformRepository =>
        databaseUrl === undefined
          ? new DisabledPlatformRepository()
          : new PrismaPlatformRepository(databaseUrl),
    },
  ],
  exports: [PLATFORM_REPOSITORY],
})
export class DatabaseModule {}
