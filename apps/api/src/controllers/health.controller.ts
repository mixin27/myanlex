import { Controller, Get, Inject } from '@nestjs/common';

import { SERVICE_VERSION } from '../api.tokens.js';
import { Public } from '../auth/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(SERVICE_VERSION) private readonly version: string) {}

  @Public()
  @Get()
  getHealth(): { readonly status: 'ok'; readonly version: string } {
    return { status: 'ok', version: this.version };
  }
}
