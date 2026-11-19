import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ApplicationInputError } from '@myanlex/application';
import type { MyanLexApplication } from '@myanlex/application';
import {
  dispatch,
  executionSchema,
  engineBuild,
  profilesFor,
  runSchema,
} from '@myanlex/playground';
import type { Run } from '@myanlex/playground';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { z } from 'zod';
import {
  MYANLEX_APPLICATION,
  PLATFORM_REPOSITORY,
  QUOTAS_ENABLED,
  DATABASE_URL,
} from '../../common/tokens.js';
import { QUOTA_REPOSITORY } from '../../common/quota/quota.repository.js';
import type { QuotaRepository } from '../../common/quota/quota.repository.js';
import { QuotaExceededException } from '../../common/quota/quota-exceeded.exception.js';
import { countRequestCharacters } from '../../common/usage/count-request-characters.js';
import { RATE_LIMIT_STORE } from '../../common/rate-limit/rate-limit.store.js';
import type { RateLimitStore } from '../../common/rate-limit/rate-limit.store.js';
import { RateLimitExceededException } from '../../common/rate-limit/rate-limit-exceeded.exception.js';
import type { PlatformRepository } from '../../infrastructure/database/platform-repository.js';
import { WORKSPACE_REPOSITORY } from '../platform/workspace.repository.js';
import type { WorkspaceRepository } from '../platform/workspace.repository.js';
import { MetricsService } from '../operations/metrics.service.js';
import {
  PLAYGROUND_REPOSITORY,
  SaveConflict,
  SaveLimit,
} from './playground.repository.js';
import type { PlaygroundRepository } from './playground.repository.js';

const titleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine(
    (value) =>
      Buffer.from(value, 'utf8').toString('utf8') === value &&
      !value.includes('\u0000'),
    'Title must be well-formed text without NUL characters.',
  );
export const saveSchema = z
  .object({
    id: z.uuid(),
    title: titleSchema,
    snapshot: runSchema,
  })
  .strict();
export const renameSchema = z.object({ title: titleSchema }).strict();
export const runQuery = z
  .object({
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
function parsed<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'The playground request does not match the operation or snapshot contract.',
    );
  return result.data;
}
@Injectable()
export class PlaygroundService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlaygroundService.name);
  private timer: ReturnType<typeof setInterval> | undefined;
  private cleaning = false;
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspace: WorkspaceRepository,
    @Inject(PLAYGROUND_REPOSITORY) private readonly saved: PlaygroundRepository,
    @Inject(PLATFORM_REPOSITORY) private readonly usage: PlatformRepository,
    @Inject(QUOTA_REPOSITORY) private readonly quotas: QuotaRepository,
    @Inject(QUOTAS_ENABLED) private readonly quotasEnabled: boolean,
    @Inject(RATE_LIMIT_STORE) private readonly rateLimits: RateLimitStore,
    @Inject(MYANLEX_APPLICATION)
    private readonly application: MyanLexApplication,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(DATABASE_URL) private readonly databaseUrl: string | undefined,
  ) {}
  onModuleInit() {
    if (this.databaseUrl) {
      this.timer = setInterval(() => {
        void this.cleanup();
      }, 3_600_000);
      this.timer.unref();
    }
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      await this.saved.cleanup();
    } catch {
      this.logger.error({ event: 'playground_cleanup_failed' });
    } finally {
      this.cleaning = false;
    }
  }
  async authorize(
    userId: string,
    organizationId: string,
    projectId: string,
    invoke = false,
  ) {
    const organization = await this.workspace.getOrganization(
      userId,
      organizationId,
    );
    if (!organization) throw new NotFoundException('Organization not found.');
    if (!(await this.workspace.findProject(organizationId, projectId)))
      throw new NotFoundException('Project not found.');
    if (
      !organization.permissions.includes('project.read') ||
      (invoke && !organization.permissions.includes('api.invoke'))
    )
      throw new ForbiddenException(
        'The project.read and, for execution or saving, api.invoke permissions are required.',
      );
  }
  async execute(
    userId: string,
    organizationId: string,
    projectId: string,
    body: unknown,
    requestId: string,
    header: (name: string, value: number) => void,
  ): Promise<Run> {
    await this.authorize(userId, organizationId, projectId, true);
    const decision = await this.rateLimits.consume(
      createHash('sha256').update(`account:${userId}`).digest('base64url'),
    );
    header('RateLimit-Limit', decision.limit);
    header('RateLimit-Remaining', decision.remaining);
    header('RateLimit-Reset', decision.retryAfterSeconds);
    if (!decision.allowed)
      throw new RateLimitExceededException(decision.retryAfterSeconds);
    const payload =
      typeof body === 'object' && body !== null && 'payload' in body
        ? body.payload
        : undefined;
    // Playground runs reserve the organization's quota, so they are metered
    // like API-key requests; enforcement only decides whether limits deny.
    const quota = await this.quotas
      .meter({
        projectId,
        characters: countRequestCharacters(payload),
        enforce: this.quotasEnabled,
        source: 'playground',
        apiKeyId: null,
        endpoint: 'playground/execute',
        requestId,
      })
      .catch(() => {
        throw new ServiceUnavailableException(
          'Usage metering is temporarily unavailable.',
        );
      });
    if (!quota.allowed)
      throw new QuotaExceededException(quota.retryAfterSeconds);
    const started = performance.now();
    let status = 200;
    let operation: string = 'invalid';
    try {
      const request = parsed(executionSchema, body);
      operation = request.operation;
      const result = dispatch(this.application, request);
      return {
        request,
        mode: 'api',
        build: engineBuild,
        profiles: profilesFor(result),
        elapsedMs: Math.max(0, performance.now() - started),
        result,
        httpStatus: 200,
        requestId,
      };
    } catch (error) {
      status =
        error instanceof HttpException
          ? error.getStatus()
          : error instanceof ApplicationInputError
            ? [
                'text_too_long',
                'batch_too_large',
                'batch_too_many_items',
              ].includes(error.code)
              ? 413
              : 400
            : 500;
      throw error;
    } finally {
      const elapsed = Math.max(0, Math.round(performance.now() - started));
      this.metrics.observePlayground(operation, status, elapsed);
      void this.usage
        .recordUsage({
          source: 'playground',
          apiKeyId: null,
          projectId,
          endpoint:
            operation === 'invalid'
              ? 'playground/invalid'
              : `playground/${operation}`,
          statusCode: status,
          requestUnits: 1,
          charactersProcessed: countRequestCharacters(payload),
          processingTimeMs: elapsed,
          usageEventId: quota.eventId,
        })
        .catch(() => {
          this.logger.error({ event: 'usage_persistence_failed' });
        });
    }
  }
  async save(
    userId: string,
    organizationId: string,
    projectId: string,
    body: unknown,
  ) {
    await this.authorize(userId, organizationId, projectId, true);
    const size = Buffer.byteLength(JSON.stringify(body) ?? '', 'utf8');
    if (size > 1_048_576)
      throw new PayloadTooLargeException(
        'Saved run exceeds 1 MiB. Export it instead.',
      );
    const input = parsed(saveSchema, body);
    try {
      return await this.saved.save(
        userId,
        projectId,
        { ...input, snapshot: input.snapshot as Run },
        size,
      );
    } catch (error) {
      if (error instanceof SaveConflict || error instanceof SaveLimit)
        throw new ConflictException(error.message);
      throw error;
    }
  }
  async list(userId: string, org: string, project: string, query: unknown) {
    await this.authorize(userId, org, project);
    return this.saved.list(userId, project, parsed(runQuery, query));
  }
  async get(userId: string, org: string, project: string, id: string) {
    await this.authorize(userId, org, project);
    const run = await this.saved.get(userId, project, id);
    if (!run) throw new NotFoundException('Saved run not found or expired.');
    return run;
  }
  async rename(
    userId: string,
    org: string,
    project: string,
    id: string,
    body: unknown,
  ) {
    await this.authorize(userId, org, project);
    const run = await this.saved.rename(
      userId,
      project,
      id,
      parsed(renameSchema, body).title,
    );
    if (!run) throw new NotFoundException('Saved run not found or expired.');
    return run;
  }
  async delete(userId: string, org: string, project: string, id: string) {
    await this.authorize(userId, org, project);
    if (!(await this.saved.delete(userId, project, id)))
      throw new NotFoundException('Saved run not found or expired.');
    return { deleted: true };
  }
}
