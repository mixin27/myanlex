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
import { AUDIT_REPOSITORY } from '../../modules/platform/audit.js';
import { PrismaAuditRepository } from './prisma-audit.repository.js';
import { disabledAuditRepository } from './disabled-audit.repository.js';
import { USAGE_LEDGER_REPOSITORY } from '../../modules/platform/usage-ledger.js';
import { PrismaUsageLedgerRepository } from './prisma-usage-ledger.repository.js';
import { disabledUsageLedgerRepository } from './disabled-usage-ledger.repository.js';
import {
  QUOTA_REPOSITORY,
  type QuotaRepository,
} from '../../common/quota/quota.repository.js';
import { PrismaQuotaRepository } from './prisma-quota.repository.js';
import { PLAYGROUND_REPOSITORY } from '../../modules/playground/playground.repository.js';
import { PrismaPlaygroundRepository } from './prisma-playground.repository.js';
import {
  BILLING_PROFILE_REPOSITORY,
  type BillingProfileRepository,
} from '../../modules/platform/billing-profile.js';
import { PrismaBillingProfileRepository } from './prisma-billing-profile.repository.js';

@Global()
@Module({
  providers: [
    {
      provide: BILLING_PROFILE_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined): BillingProfileRepository => {
        if (url) return new PrismaBillingProfileRepository(url);
        const unavailable = () =>
          Promise.reject(new Error('Database unavailable.'));
        return {
          profile: unavailable,
          updateDetails: unavailable,
          addEmail: unavailable,
          resendEmail: unavailable,
          removeEmail: unavailable,
          confirmEmail: unavailable,
        };
      },
    },
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
              meter: () => Promise.reject(new Error('Database unavailable.')),
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
      provide: AUDIT_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined) =>
        url ? new PrismaAuditRepository(url) : disabledAuditRepository,
    },
    {
      provide: USAGE_LEDGER_REPOSITORY,
      inject: [DATABASE_URL],
      useFactory: (url: string | undefined) =>
        url
          ? new PrismaUsageLedgerRepository(url)
          : disabledUsageLedgerRepository,
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
    BILLING_PROFILE_REPOSITORY,
    PLATFORM_REPOSITORY,
    WORKSPACE_REPOSITORY,
    TEAM_REPOSITORY,
    AUDIT_REPOSITORY,
    USAGE_LEDGER_REPOSITORY,
    QUOTA_REPOSITORY,
    PLAYGROUND_REPOSITORY,
  ],
})
export class DatabaseModule {}
