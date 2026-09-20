import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimitService } from './rate-limit.service.js';
import { RATE_LIMIT_STORE } from './rate-limit.store.js';
import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  REDIS_URL,
  REDIS_PREFIX,
} from '../tokens.js';
import { RedisRateLimitStore } from '../../infrastructure/redis/redis-rate-limit.store.js';

@Module({
  providers: [
    {
      provide: RATE_LIMIT_STORE,
      inject: [
        REDIS_URL,
        REDIS_PREFIX,
        RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_MS,
      ],
      useFactory: (
        url: string | undefined,
        prefix: string,
        limit: number,
        windowMs: number,
      ) =>
        url
          ? new RedisRateLimitStore(url, prefix, limit, windowMs)
          : new RateLimitService(limit, windowMs),
    },
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class RateLimitModule {}
