import { performance } from 'node:perf_hooks';

import { ApplicationInputError } from '@myanlex/application';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';

import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { PLATFORM_REPOSITORY } from '../tokens.js';
import type { PlatformRepository } from '../../infrastructure/database/platform-repository.js';

interface UsageRequest extends AuthenticatedRequest {
  readonly body?: unknown;
  readonly routeOptions?: { readonly url?: string };
  readonly url: string;
}

interface UsageReply {
  readonly statusCode: number;
}

function countCodePoints(text: string): number {
  let count = 0;
  for (const codePoint of text) {
    if (codePoint.length > 0) count += 1;
  }
  return count;
}

export function countRequestCharacters(body: unknown): number {
  if (typeof body !== 'object' || body === null) return 0;

  if ('text' in body && typeof body.text === 'string') {
    return countCodePoints(body.text);
  }

  if ('items' in body && Array.isArray(body.items)) {
    return body.items.reduce<number>((total, item: unknown) => {
      if (
        typeof item !== 'object' ||
        item === null ||
        !('text' in item) ||
        typeof item.text !== 'string'
      ) {
        return total;
      }
      return total + countCodePoints(item.text);
    }, 0);
  }

  return 0;
}

function statusForError(error: unknown): number {
  if (error instanceof HttpException) return error.getStatus();
  if (error instanceof ApplicationInputError) {
    return error.code === 'text_too_long' ||
      error.code === 'batch_too_large' ||
      error.code === 'batch_too_many_items'
      ? 413
      : 400;
  }
  return 500;
}

@Injectable()
export class UsageInterceptor implements NestInterceptor {
  private readonly logger = new Logger(UsageInterceptor.name);

  constructor(
    @Inject(PLATFORM_REPOSITORY)
    private readonly platformRepository: PlatformRepository,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<UsageRequest>();
    const reply = http.getResponse<UsageReply>();
    const principal = request.apiKeyPrincipal;

    if (principal?.persisted !== true) return next.handle();

    const startedAt = performance.now();
    const charactersProcessed = countRequestCharacters(request.body);
    const endpoint = request.routeOptions?.url ?? request.url;

    const record = (statusCode: number): void => {
      const processingTimeMs = Math.max(
        0,
        Math.round(performance.now() - startedAt),
      );

      void this.platformRepository
        .recordUsage({
          apiKeyId: principal.apiKeyId,
          projectId: principal.projectId,
          endpoint,
          statusCode,
          requestUnits: 1,
          charactersProcessed,
          processingTimeMs,
        })
        .catch((error: unknown) => {
          this.logger.error('Failed to record API usage.', error);
        });
    };

    return next.handle().pipe(
      tap({
        next: () => record(reply.statusCode),
        error: (error: unknown) => record(statusForError(error)),
      }),
    );
  }
}
