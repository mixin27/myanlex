import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DATABASE_URL, QUOTAS_ENABLED } from '../tokens.js';
import { PrismaQuotaRepository } from '../../infrastructure/database/prisma-quota.repository.js';
import { QuotaGuard } from './quota.guard.js';
import { QUOTA_REPOSITORY, type QuotaRepository } from './quota.repository.js';

@Module({
  providers: [
    {
      provide: QUOTA_REPOSITORY,
      inject: [DATABASE_URL, QUOTAS_ENABLED],
      useFactory: (
        url: string | undefined,
        enabled: boolean,
      ): QuotaRepository => {
        if (enabled && url) return new PrismaQuotaRepository(url);
        return {
          consume: () =>
            Promise.reject(new Error('Quota enforcement is disabled.')),
        };
      },
    },
    { provide: APP_GUARD, useClass: QuotaGuard },
  ],
})
export class QuotaModule {}
