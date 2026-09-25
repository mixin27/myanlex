import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ReadinessService } from './readiness.service.js';

import { Public } from '../../common/auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
    @Inject(ReadinessService) private readonly readiness: ReadinessService,
  ) {}

  @Public()
  @Get()
  getHealth(): { readonly status: 'ok'; readonly version: string } {
    return this.healthService.getHealth();
  }

  @Public()
  @Get('ready')
  async getReadiness(
    @Res({ passthrough: true }) reply: { code(status: number): unknown },
  ): Promise<{ status: 'ready' | 'not_ready' }> {
    const ready = await this.readiness.isReady();
    reply.code(ready ? 200 : 503);
    return { status: ready ? 'ready' : 'not_ready' };
  }
}
