import { createHash } from 'node:crypto';

import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_ROUTE } from '../auth/public.decorator.js';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { RateLimitExceededException } from './rate-limit-exceeded.exception.js';
import { RateLimitService } from './rate-limit.service.js';

interface RateLimitedRequest extends AuthenticatedRequest {
  readonly headers: { readonly authorization?: string };
  readonly ip: string;
}

interface RateLimitedReply {
  header(name: string, value: number): void;
}

function trackerFor(request: RateLimitedRequest): string {
  const identity =
    request.apiKeyPrincipal?.apiKeyId ??
    request.headers.authorization ??
    request.ip;
  return createHash('sha256').update(identity).digest('base64url');
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RateLimitService)
    private readonly rateLimits: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<RateLimitedRequest>();
    const reply = http.getResponse<RateLimitedReply>();
    const decision = this.rateLimits.consume(trackerFor(request));

    reply.header('RateLimit-Limit', decision.limit);
    reply.header('RateLimit-Remaining', decision.remaining);
    reply.header('RateLimit-Reset', decision.retryAfterSeconds);

    if (!decision.allowed) {
      throw new RateLimitExceededException(decision.retryAfterSeconds);
    }

    return true;
  }
}
