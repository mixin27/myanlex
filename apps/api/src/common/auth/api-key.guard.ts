import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { ApiKeyAuthenticationService } from './api-key-authentication.service.js';
import { IS_PUBLIC_ROUTE } from './public.decorator.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(ApiKeyAuthenticationService)
    private readonly authentication: ApiKeyAuthenticationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const prefix = 'Bearer ';

    if (authorization === undefined || !authorization.startsWith(prefix)) {
      throw new UnauthorizedException('A valid bearer API key is required.');
    }

    const principal = await this.authentication.authenticate(
      authorization.slice(prefix.length),
    );

    if (principal === undefined) {
      throw new UnauthorizedException('A valid bearer API key is required.');
    }

    request.apiKeyPrincipal = principal;

    return true;
  }
}
