import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthenticatedRequest } from './authenticated-request.js';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator.js';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = new Set(request.apiKeyPrincipal?.permissionKeys ?? []);

    if (granted.has('*') || required.every((key) => granted.has(key))) {
      return true;
    }

    throw new ForbiddenException(
      'The API key does not grant every required permission.',
    );
  }
}
