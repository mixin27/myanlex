import { PrismaPg } from '@prisma/adapter-pg';
import type { OnApplicationShutdown } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import { PrismaClient } from '../../generated/prisma/client.js';
import type {
  ApiKeyPrincipal,
  PlatformRepository,
  UsageRecord,
} from './platform-repository.js';

@Injectable()
export class PrismaPlatformRepository
  implements PlatformRepository, OnApplicationShutdown
{
  private readonly client: PrismaClient;

  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5_000,
    });
    this.client = new PrismaClient({ adapter });
  }

  async authenticateApiKey(
    keyHash: string,
    now: Date,
  ): Promise<ApiKeyPrincipal | undefined> {
    const apiKey = await this.client.apiKey.findFirst({
      where: {
        keyHash,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        projectId: true,
        scopes: {
          select: { permission: { select: { key: true } } },
        },
      },
    });

    if (apiKey === null) return undefined;

    await this.client.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: now },
    });

    return {
      apiKeyId: apiKey.id,
      projectId: apiKey.projectId,
      permissionKeys: apiKey.scopes.map((scope) => scope.permission.key),
      persisted: true,
    };
  }

  async memberHasPermission(
    userId: string,
    organizationId: string,
    permissionKey: string,
  ): Promise<boolean> {
    const membership = await this.client.organizationMember.findFirst({
      where: {
        userId,
        organizationId,
        role: {
          permissions: { some: { permission: { key: permissionKey } } },
        },
      },
      select: { userId: true },
    });

    return membership !== null;
  }

  async recordUsage(record: UsageRecord): Promise<void> {
    await this.client.apiUsage.create({ data: record });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.$disconnect();
  }
}
