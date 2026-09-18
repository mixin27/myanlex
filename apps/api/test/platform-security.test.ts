import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  ApiKeyAuthenticationService,
  hashApiKey,
} from '../src/common/auth/api-key-authentication.service.js';
import { PermissionGuard } from '../src/common/auth/permission.guard.js';
import { RbacService } from '../src/common/auth/rbac.service.js';
import type { PlatformRepository } from '../src/infrastructure/database/platform-repository.js';

function repositoryStub(): PlatformRepository {
  return {
    authenticateApiKey: vi.fn().mockResolvedValue(undefined),
    memberHasPermission: vi.fn().mockResolvedValue(false),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  };
}

describe('platform security', () => {
  it('hashes API keys before repository lookup', async () => {
    const repository = repositoryStub();
    const authentication = new ApiKeyAuthenticationService(
      undefined,
      repository,
    );

    await authentication.authenticate('mylx_live_secret');

    expect(repository.authenticateApiKey).toHaveBeenCalledWith(
      hashApiKey('mylx_live_secret'),
      expect.any(Date),
    );
    expect(repository.authenticateApiKey).not.toHaveBeenCalledWith(
      'mylx_live_secret',
      expect.anything(),
    );
  });

  it('keeps the configured key as an unpersisted bootstrap identity', async () => {
    const repository = repositoryStub();
    const authentication = new ApiKeyAuthenticationService(
      'bootstrap-secret',
      repository,
    );

    await expect(
      authentication.authenticate('bootstrap-secret'),
    ).resolves.toEqual({
      apiKeyId: 'bootstrap',
      projectId: 'bootstrap',
      permissionKeys: ['*'],
      persisted: false,
    });
    expect(repository.authenticateApiKey).not.toHaveBeenCalled();
  });

  it('delegates member authorization to dynamic role permissions', async () => {
    const repository = repositoryStub();
    vi.mocked(repository.memberHasPermission).mockResolvedValue(true);
    const rbac = new RbacService(repository);

    await expect(
      rbac.hasPermission('user-id', 'organization-id', 'project.create'),
    ).resolves.toBe(true);
    expect(repository.memberHasPermission).toHaveBeenCalledWith(
      'user-id',
      'organization-id',
      'project.create',
    );
  });

  it('rejects API keys without every required permission', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(['api.invoke']),
    };
    const guard = new PermissionGuard(reflector as never);
    const context = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          apiKeyPrincipal: { permissionKeys: ['usage.read'] },
        }),
      }),
    };

    expect(() => guard.canActivate(context as never)).toThrow(
      ForbiddenException,
    );
  });
});
