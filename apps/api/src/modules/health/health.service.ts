import { Inject, Injectable } from '@nestjs/common';

import { SERVICE_VERSION } from '../../common/tokens.js';

@Injectable()
export class HealthService {
  constructor(@Inject(SERVICE_VERSION) private readonly version: string) {}

  getHealth(): { readonly status: 'ok'; readonly version: string } {
    return { status: 'ok', version: this.version };
  }
}
