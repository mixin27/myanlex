export interface ApiKeyPrincipal {
  readonly apiKeyId: string;
  readonly projectId: string;
  readonly permissionKeys: readonly string[];
  readonly persisted: boolean;
}

export interface UsageRecord {
  readonly apiKeyId: string;
  readonly projectId: string;
  readonly endpoint: string;
  readonly statusCode: number;
  readonly requestUnits: number;
  readonly charactersProcessed: number;
  readonly processingTimeMs: number;
}

export interface PlatformRepository {
  authenticateApiKey(
    keyHash: string,
    now: Date,
  ): Promise<ApiKeyPrincipal | undefined>;
  memberHasPermission(
    userId: string,
    organizationId: string,
    permissionKey: string,
  ): Promise<boolean>;
  recordUsage(record: UsageRecord): Promise<void>;
}
