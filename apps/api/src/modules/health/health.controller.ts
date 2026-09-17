import { Controller, Get, Inject } from '@nestjs/common';

import { Public } from '../../common/auth/public.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Public()
  @Get()
  getHealth(): { readonly status: 'ok'; readonly version: string } {
    return this.healthService.getHealth();
  }
}
