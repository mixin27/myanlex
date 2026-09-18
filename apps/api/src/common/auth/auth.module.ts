import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { ApiKeyAuthenticationService } from './api-key-authentication.service.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { PermissionGuard } from './permission.guard.js';
import { RbacService } from './rbac.service.js';

@Module({
  providers: [
    ApiKeyAuthenticationService,
    RbacService,
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [RbacService],
})
export class AuthModule {}
