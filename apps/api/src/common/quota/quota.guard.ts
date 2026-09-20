import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import { IS_PUBLIC_ROUTE } from '../auth/public.decorator.js';
import { QUOTAS_ENABLED } from '../tokens.js';
import { countRequestCharacters } from '../usage/count-request-characters.js';
import { QUOTA_REPOSITORY, type QuotaRepository } from './quota.repository.js';
import { QuotaExceededException } from './quota-exceeded.exception.js';

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    @Inject(QUOTAS_ENABLED) private readonly enabled: boolean,
    @Inject(QUOTA_REPOSITORY) private readonly repository: QuotaRepository,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      !this.enabled ||
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & { body?: unknown }>();
    if (request.apiKeyPrincipal?.persisted !== true) return true;
    const decision = await this.repository
      .consume(
        request.apiKeyPrincipal.projectId,
        countRequestCharacters(request.body),
      )
      .catch(() => {
        throw new ServiceUnavailableException(
          'Quota enforcement is temporarily unavailable.',
        );
      });
    if (!decision.allowed)
      throw new QuotaExceededException(decision.retryAfterSeconds);
    return true;
  }
}
