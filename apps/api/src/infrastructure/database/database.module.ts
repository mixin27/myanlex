import { Global, Module } from '@nestjs/common';

import { DATABASE_URL, PLATFORM_REPOSITORY } from '../../common/tokens.js';
import { DisabledPlatformRepository } from './disabled-platform.repository.js';
import type { PlatformRepository } from './platform-repository.js';
import { PrismaPlatformRepository } from './prisma-platform.repository.js';
import { WORKSPACE_REPOSITORY } from '../../modules/platform/workspace.repository.js';
import { PrismaWorkspaceRepository } from './prisma-workspace.repository.js';
import { disabledWorkspaceRepository } from './disabled-workspace.repository.js';
import { TEAM_REPOSITORY } from '../../modules/platform/team.repository.js';
import { PrismaTeamRepository } from './prisma-team.repository.js';
import { disabledTeamRepository } from './disabled-team.repository.js';
import {
  QUOTA_REPOSITORY,
  type QuotaRepository,
} from '../../common/quota/quota.repository.js';
import { PrismaQuotaRepository } from './prisma-quota.repository.js';
import { PLAYGROUND_REPOSITORY } from '../../modules/playground/playground.repository.js';
import { PrismaPlaygroundRepository } from './prisma-playground.repository.js';

@Global()
@Module({
  providers: [
    {
      provide: PLAYGROUND_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined) =>
        url
          ? new PrismaPlaygroundRepository(url)
          : Object.fromEntries(
              ['save', 'list', 'get', 'rename', 'delete', 'cleanup'].map(
                (method) => [
                  method,
                  () => Promise.reject(new Error('Database unavailable.')),
                ],
              ),
            ),
    },
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
      provide: TEAM_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined) =>
        url ? new PrismaTeamRepository(url) : disabledTeamRepository,
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
  exports: [
    PLATFORM_REPOSITORY,
    WORKSPACE_REPOSITORY,
    TEAM_REPOSITORY,
    QUOTA_REPOSITORY,
    PLAYGROUND_REPOSITORY,
  ],
})
export class DatabaseModule {}
