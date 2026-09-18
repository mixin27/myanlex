import { createHash, timingSafeEqual } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import type {
  ApiKeyPrincipal,
  PlatformRepository,
} from '../../infrastructure/database/platform-repository.js';
import { API_KEY, PLATFORM_REPOSITORY } from '../tokens.js';

function secretsMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

@Injectable()
export class ApiKeyAuthenticationService {
  constructor(
    @Inject(API_KEY) private readonly bootstrapApiKey: string | undefined,
    @Inject(PLATFORM_REPOSITORY)
    private readonly platformRepository: PlatformRepository,
  ) {}

  async authenticate(apiKey: string): Promise<ApiKeyPrincipal | undefined> {
    if (
      this.bootstrapApiKey !== undefined &&
      secretsMatch(apiKey, this.bootstrapApiKey)
    ) {
      return {
        apiKeyId: 'bootstrap',
        projectId: 'bootstrap',
        permissionKeys: ['*'],
        persisted: false,
      };
    }

    return this.platformRepository.authenticateApiKey(
      hashApiKey(apiKey),
      new Date(),
    );
  }
}
