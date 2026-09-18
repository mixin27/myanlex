import { Injectable } from '@nestjs/common';

import type {
  ApiKeyPrincipal,
  PlatformRepository,
} from './platform-repository.js';

@Injectable()
export class DisabledPlatformRepository implements PlatformRepository {
  authenticateApiKey(): Promise<ApiKeyPrincipal | undefined> {
    return Promise.resolve(undefined);
  }

  memberHasPermission(): Promise<boolean> {
    return Promise.resolve(false);
  }

  recordUsage(): Promise<void> {
    return Promise.resolve();
  }
}
