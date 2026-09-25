import { Module } from '@nestjs/common';

import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { READINESS_PROBES, ReadinessService } from './readiness.service.js';
import { DatabaseReadinessProbe } from '../../infrastructure/database/database-readiness.probe.js';
import { RateLimitModule } from '../../common/rate-limit/rate-limit.module.js';
import {
  RATE_LIMIT_STORE,
  type RateLimitStore,
} from '../../common/rate-limit/rate-limit.store.js';
import { RedisRateLimitStore } from '../../infrastructure/redis/redis-rate-limit.store.js';

@Module({
  imports: [RateLimitModule],
  controllers: [HealthController],
  providers: [
    HealthService,
    ReadinessService,
    DatabaseReadinessProbe,
    {
      provide: READINESS_PROBES,
      inject: [DatabaseReadinessProbe, RATE_LIMIT_STORE],
      useFactory: (database: DatabaseReadinessProbe, store: RateLimitStore) =>
        store instanceof RedisRateLimitStore ? [database, store] : [database],
    },
  ],
})
export class HealthModule {}
