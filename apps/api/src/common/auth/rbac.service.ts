import { Inject, Injectable } from '@nestjs/common';

import type { PlatformRepository } from '../../infrastructure/database/platform-repository.js';
import { PLATFORM_REPOSITORY } from '../tokens.js';

@Injectable()
export class RbacService {
  constructor(
    @Inject(PLATFORM_REPOSITORY)
    private readonly platformRepository: PlatformRepository,
  ) {}

  hasPermission(
    userId: string,
    organizationId: string,
    permissionKey: string,
  ): Promise<boolean> {
    return this.platformRepository.memberHasPermission(
      userId,
      organizationId,
      permissionKey,
    );
  }
}
