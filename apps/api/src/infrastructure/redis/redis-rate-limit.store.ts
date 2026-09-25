import type { OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { createClient } from 'redis';

import type { RateLimitStore } from '../../common/rate-limit/rate-limit.store.js';
import type { RateLimitDecision } from '../../common/rate-limit/rate-limit.service.js';

// One atomic operation: rejected requests neither increment nor extend the TTL.
const consumeScript = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if not count or count < 0 or count ~= math.floor(count) then return redis.error_reply('Invalid limiter count') end
local ttl = redis.call('PTTL', KEYS[1])
if count > 0 and ttl < 0 then return redis.error_reply('Invalid limiter TTL') end
if count >= tonumber(ARGV[1]) then return {0, 0, ttl} end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]); ttl = tonumber(ARGV[2]) end
return {1, tonumber(ARGV[1]) - count, ttl}
`;

export class RedisRateLimitStore
  implements RateLimitStore, OnModuleInit, OnApplicationShutdown
{
  private readonly client;
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private unavailableLogged = false;

  constructor(
    url: string,
    private readonly prefix: string,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    this.client = createClient({
      url,
      socket: { connectTimeout: 2_000 },
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1_000,
      commandOptions: { timeout: 2_000 },
    });
    // Never log connection URLs, credentials, or raw Redis errors.
    this.client.on('error', () => {
      if (!this.unavailableLogged) {
        this.logger.warn('Distributed rate limiter connection unavailable.');
        this.unavailableLogged = true;
      }
    });
    this.client.on('ready', () => {
      this.unavailableLogged = false;
      this.logger.log('Distributed rate limiter connected.');
    });
  }

  onModuleInit(): void {
    void this.client
      .connect()
      .catch(() =>
        this.logger.warn('Distributed rate limiter connection unavailable.'),
      );
  }

  async consume(tracker: string): Promise<RateLimitDecision> {
    try {
      if (!this.client.isReady) throw new Error('Not ready');
      const result = await this.client.eval(consumeScript, {
        keys: [`${this.prefix}:rate:v1:${tracker}`],
        arguments: [String(this.limit), String(this.windowMs)],
      });
      if (
        !Array.isArray(result) ||
        result.length !== 3 ||
        !result.every(
          (value) => typeof value === 'number' && Number.isFinite(value),
        )
      ) {
        throw new Error('Invalid counter response');
      }
      const [allowed, remaining, ttl] = result as [number, number, number];
      if ((allowed !== 0 && allowed !== 1) || remaining < 0 || ttl < 0)
        throw new Error('Invalid counter state');
      return {
        allowed: allowed === 1,
        limit: this.limit,
        remaining,
        retryAfterSeconds: Math.max(1, Math.ceil(ttl / 1_000)),
      };
    } catch {
      // No local fallback: that would multiply the allowance across replicas.
      throw new ServiceUnavailableException(
        'Rate limiting is temporarily unavailable.',
      );
    }
  }

  async checkReady(): Promise<boolean> {
    if (!this.client.isReady) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  onApplicationShutdown(): void {
    if (this.client.isOpen) this.client.destroy();
  }
}
