import { timingSafeEqual } from 'node:crypto';

import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { API_KEY } from '../tokens.js';
import { IS_PUBLIC_ROUTE } from './public.decorator.js';

function secretsMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);

  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(API_KEY) private readonly apiKey: string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic === true) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ readonly headers: { readonly authorization?: string } }>();
    const authorization = request.headers.authorization;
    const prefix = 'Bearer ';

    if (
      authorization === undefined ||
      !authorization.startsWith(prefix) ||
      !secretsMatch(authorization.slice(prefix.length), this.apiKey)
    ) {
      throw new UnauthorizedException('A valid bearer API key is required.');
    }

    return true;
  }
}
