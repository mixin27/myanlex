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
    @Inject(QUOTA_REPOSITORY)
    private readonly repository: Pick<QuotaRepository, 'meter'>,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<
      AuthenticatedRequest & {
        body?: unknown;
        routeOptions?: { readonly url?: string };
      }
    >();
    const principal = request.apiKeyPrincipal;
    if (principal?.persisted !== true) return true;
    // Metering is always on for persisted keys; `enabled` only decides whether
    // plan limits can deny. A request that cannot be metered is not served.
    const decision = await this.repository
      .meter({
        projectId: principal.projectId,
        characters: countRequestCharacters(request.body),
        enforce: this.enabled,
        source: 'api_key',
        apiKeyId: principal.apiKeyId,
        endpoint: request.routeOptions?.url ?? 'unmatched',
        requestId: request.id,
      })
      .catch(() => {
        throw new ServiceUnavailableException(
          'Usage metering is temporarily unavailable.',
        );
      });
    if (!decision.allowed)
      throw new QuotaExceededException(decision.retryAfterSeconds);
    if (decision.eventId) request.usageEventId = decision.eventId;
    return true;
  }
}
