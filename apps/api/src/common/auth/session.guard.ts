import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AccountAuthService } from '../../modules/account-auth/account-auth.service.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import { SESSION_ROUTE } from './session-route.decorator.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccountAuthService) private readonly accounts: AccountAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      !this.reflector.getAllAndOverride<boolean>(SESSION_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const http = context.switchToHttp();
    http
      .getResponse<{ header(name: string, value: string): void }>()
      .header('Cache-Control', 'private, no-store');
    const request = http.getRequest<
      AuthenticatedRequest & { method: string }
    >();
    const auth = this.accounts.requireAuth();
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.origin !== this.accounts.publicURL
    ) {
      throw new ForbiddenException(
        'The request Origin must match the configured portal origin.',
      );
    }
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: request.headers.cookie ?? '' }),
      query: { disableRefresh: true, disableCookieCache: true },
    });
    if (!session)
      throw new UnauthorizedException('A valid account session is required.');
    if (!session.user.emailVerified)
      throw new ForbiddenException('Email verification is required.');
    request.accountPrincipal = { userId: session.user.id };
    return true;
  }
}
