import { Global, Module } from '@nestjs/common';

import { DATABASE_URL, PLATFORM_REPOSITORY } from '../../common/tokens.js';
import { DisabledPlatformRepository } from './disabled-platform.repository.js';
import type { PlatformRepository } from './platform-repository.js';
import { PrismaPlatformRepository } from './prisma-platform.repository.js';
import { WORKSPACE_REPOSITORY } from '../../modules/platform/workspace.repository.js';
import { PrismaWorkspaceRepository } from './prisma-workspace.repository.js';
import { disabledWorkspaceRepository } from './disabled-workspace.repository.js';
import {
  QUOTA_REPOSITORY,
  type QuotaRepository,
} from '../../common/quota/quota.repository.js';
import { PrismaQuotaRepository } from './prisma-quota.repository.js';

@Global()
@Module({
  providers: [
    {
      provide: QUOTA_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined): QuotaRepository =>
        url
          ? new PrismaQuotaRepository(url)
          : {
              consume: () => Promise.reject(new Error('Database unavailable.')),
              read: () => Promise.reject(new Error('Database unavailable.')),
            },
    },
    {
      provide: WORKSPACE_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined) =>
        url ? new PrismaWorkspaceRepository(url) : disabledWorkspaceRepository,
    },
    {
      provide: PLATFORM_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (databaseUrl: string | undefined): PlatformRepository =>
        databaseUrl === undefined
          ? new DisabledPlatformRepository()
          : new PrismaPlatformRepository(databaseUrl),
    },
  ],
  exports: [PLATFORM_REPOSITORY, WORKSPACE_REPOSITORY, QUOTA_REPOSITORY],
})
export class DatabaseModule {}
