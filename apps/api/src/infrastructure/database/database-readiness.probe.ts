import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_URL } from '../../common/tokens.js';

@Injectable()
export class DatabaseReadinessProbe implements OnApplicationShutdown {
  private readonly pool: Pool | undefined;

  constructor(@Inject(DATABASE_URL) url: string | undefined) {
    if (url) {
      this.pool = new Pool({
        connectionString: url,
        max: 1,
        connectionTimeoutMillis: 1_000,
        query_timeout: 1_000,
        statement_timeout: 1_000,
        idleTimeoutMillis: 10_000,
      });
      // Idle connection failures must not crash the process or expose URLs.
      this.pool.on('error', () => {});
    }
  }

  async checkReady(): Promise<boolean> {
    if (!this.pool) return true;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool?.end();
  }
}
