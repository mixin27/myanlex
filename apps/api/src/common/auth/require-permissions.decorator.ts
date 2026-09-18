import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS = Symbol('REQUIRED_PERMISSIONS');

export const RequirePermissions = (...permissionKeys: readonly string[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissionKeys);
