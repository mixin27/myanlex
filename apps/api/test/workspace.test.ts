import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { ApiKeysService } from '../src/modules/platform/api-keys.service.js';
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';
import { PlatformService } from '../src/modules/platform/platform.service.js';
import { WorkspaceConflict } from '../src/modules/platform/workspace.repository.js';
import type { WorkspaceRepository } from '../src/modules/platform/workspace.repository.js';
import { projectUpdateInput } from '../src/modules/platform/platform.schemas.js';
import { loadOpenApiDocument } from '../src/common/docs/api-documentation.js';

const userId = randomUUID();
const organizationId = randomUUID();
const projectId = randomUUID();
const organization = { id: organizationId, name: 'မြန်မာ', slug: 'my-team' };
const project = {
  id: projectId,
  organizationId,
  name: 'Production',
  slug: 'production',
  environment: 'production',
};
const origin = 'http://localhost:3000';
const repository: WorkspaceRepository = {
  findProject: vi.fn(),
  listApiKeys: vi.fn(),
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  createOrganization: vi.fn(),
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
};

describe('session-protected workspace HTTP contract', () => {
  let app: NestFastifyApplication;
  const getSession = vi.fn();
  const request = (
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/v1/platform/${path}`,
      headers: { cookie: 'session=valid', origin, ...headers },
      ...(payload ? { payload } : {}),
    });

  beforeAll(async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    app = await createApiApplication({
      apiKey: 'bootstrap-test',
      logger: false,
      rateLimitMaxRequests: 1000,
    });
    Object.defineProperty(app.get(PlatformService), 'repository', {
      value: repository,
    });
    Object.defineProperty(app.get(ApiKeysService), 'repository', {
      value: repository,
    });
    Object.defineProperties(app.get(AccountAuthService), {
      auth: { value: { api: { getSession } } },
      publicURL: { value: origin },
    });
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockImplementation(async ({ headers }: { headers: Headers }) =>
      headers.get('cookie') === 'session=valid'
        ? { user: { id: userId, emailVerified: true } }
        : null,
    );
    vi.mocked(repository.getOrganization).mockImplementation(
      async (_user, id) =>
        id === organizationId
          ? {
              ...organization,
              permissions: [
                'project.read',
                'project.create',
                'project.update',
                'api_key.read',
                'api_key.create',
                'api_key.revoke',
                'api.invoke',
              ],
            }
          : null,
    );
    vi.mocked(repository.createOrganization).mockResolvedValue(organization);
    vi.mocked(repository.listOrganizations).mockResolvedValue({
      items: [organization],
      nextCursor: null,
    });
    vi.mocked(repository.listProjects).mockResolvedValue({
      items: [project],
      nextCursor: null,
    });
    vi.mocked(repository.createProject).mockResolvedValue(project);
    vi.mocked(repository.updateProject).mockResolvedValue(project);
    vi.mocked(repository.findProject).mockImplementation(async (org, id) =>
      org === organizationId && id === projectId ? project : null,
    );
  });

  it('onboards using the session user, not a client-supplied identity', async () => {
    const result = await request('POST', 'organizations', {
      name: ' မြန်မာ ',
      slug: 'my-team',
    });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toEqual(organization);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(repository.createOrganization).toHaveBeenCalledWith(userId, {
      name: 'မြန်မာ',
      slug: 'my-team',
    });
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { disableRefresh: true, disableCookieCache: true },
      }),
    );
  });

  it.each(['', 'session=forged'])(
    'rejects absent/invalid sessions, even with a bootstrap bearer key (%s)',
    async (cookie) => {
      expect(
        (
          await request('GET', 'organizations', undefined, {
            cookie,
            authorization: 'Bearer bootstrap-test',
          })
        ).statusCode,
      ).toBe(401);
      expect(repository.listOrganizations).not.toHaveBeenCalled();
    },
  );

  it('rejects unverified users', async () => {
    getSession.mockResolvedValue({
      user: { id: userId, emailVerified: false },
    });
    expect(
      (await request('POST', 'organizations', { name: 'Team', slug: 'team' }))
        .statusCode,
    ).toBe(403);
    expect(repository.createOrganization).not.toHaveBeenCalled();
  });

  it.each(['', 'null', 'https://attacker.example'])(
    'rejects unsafe or missing Origin on writes (%s)',
    async (unsafeOrigin) => {
      expect(
        (
          await request(
            'POST',
            'organizations',
            { name: 'Team', slug: 'team' },
            { origin: unsafeOrigin },
          )
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await request(
            'PATCH',
            `organizations/${organizationId}/projects/${projectId}`,
            { name: 'Changed' },
            { origin: unsafeOrigin },
          )
        ).statusCode,
      ).toBe(403);
      expect(repository.createOrganization).not.toHaveBeenCalled();
      expect(repository.updateProject).not.toHaveBeenCalled();
    },
  );

  it('returns only the current member organizations and validated pagination', async () => {
    const after = randomUUID();
    expect(
      (await request('GET', `organizations?limit=10&after=${after}`))
        .statusCode,
    ).toBe(200);
    expect(repository.listOrganizations).toHaveBeenCalledWith(userId, {
      limit: 10,
      after,
    });
    expect((await request('GET', 'organizations?limit=101')).statusCode).toBe(
      400,
    );
    expect((await request('GET', 'organizations?after=bad')).statusCode).toBe(
      400,
    );
  });

  it('returns 404 for another organization on read/create/update', async () => {
    const foreign = randomUUID();
    expect((await request('GET', `organizations/${foreign}`)).statusCode).toBe(
      404,
    );
    expect(
      (await request('GET', `organizations/${foreign}/projects`)).statusCode,
    ).toBe(404);
    expect(
      (
        await request('POST', `organizations/${foreign}/projects`, {
          name: 'Test',
          slug: 'test',
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await request(
          'PATCH',
          `organizations/${foreign}/projects/${projectId}`,
          { name: 'Test' },
        )
      ).statusCode,
    ).toBe(404);
    expect(repository.createProject).not.toHaveBeenCalled();
    expect(repository.updateProject).not.toHaveBeenCalled();
  });

  it('checks current permissions on every request with no Owner-name bypass', async () => {
    expect(
      (await request('GET', `organizations/${organizationId}/projects`))
        .statusCode,
    ).toBe(200);
    vi.mocked(repository.getOrganization).mockResolvedValue({
      ...organization,
      permissions: [],
    });
    expect(
      (await request('GET', `organizations/${organizationId}/projects`))
        .statusCode,
    ).toBe(403);
    expect(
      (
        await request('POST', `organizations/${organizationId}/projects`, {
          name: 'Test',
          slug: 'test',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await request(
          'PATCH',
          `organizations/${organizationId}/projects/${projectId}`,
          { name: 'Test' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await request('GET', `organizations/${organizationId}`)).statusCode,
    ).toBe(200);
  });

  it('creates and updates projects with an explicit organization boundary', async () => {
    expect(
      (
        await request('POST', `organizations/${organizationId}/projects`, {
          name: 'Test',
          slug: 'test',
        })
      ).statusCode,
    ).toBe(201);
    expect(repository.createProject).toHaveBeenCalledWith(organizationId, {
      name: 'Test',
      slug: 'test',
      environment: 'development',
    });
    expect(
      (
        await request(
          'PATCH',
          `organizations/${organizationId}/projects/${projectId}`,
          { name: 'Changed' },
        )
      ).statusCode,
    ).toBe(200);
    expect(repository.updateProject).toHaveBeenCalledWith(
      organizationId,
      projectId,
      { name: 'Changed' },
    );
    expect(projectUpdateInput.parse({ name: 'Changed' })).toEqual({
      name: 'Changed',
    });
    vi.mocked(repository.updateProject).mockResolvedValue(null);
    expect(
      (
        await request(
          'PATCH',
          `organizations/${organizationId}/projects/${randomUUID()}`,
          { name: 'Changed' },
        )
      ).statusCode,
    ).toBe(404);
  });

  it.each([
    { name: '', slug: 'test' },
    { name: 'Team', slug: 'Bad Slug' },
    { name: 'Team', slug: 'test', userId },
    { name: 'Team', slug: 'test', role: 'owner' },
    { name: 'Team', slug: 'test', permissions: ['*'] },
  ])(
    'rejects invalid and privilege-escalation payloads (%j)',
    async (payload) => {
      expect((await request('POST', 'organizations', payload)).statusCode).toBe(
        400,
      );
      expect(repository.createOrganization).not.toHaveBeenCalled();
    },
  );

  it('rejects tenant reassignment, invalid IDs and empty updates', async () => {
    expect(
      (
        await request(
          'PATCH',
          `organizations/${organizationId}/projects/${projectId}`,
          { organizationId: randomUUID() },
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request(
          'PATCH',
          `organizations/${organizationId}/projects/${projectId}`,
          {},
        )
      ).statusCode,
    ).toBe(400);
    expect(
      (await request('GET', 'organizations/not-a-uuid/projects')).statusCode,
    ).toBe(400);
  });

  it('maps slug conflicts to problem details without leaking database internals', async () => {
    vi.mocked(repository.createOrganization).mockRejectedValue(
      new WorkspaceConflict('This slug is already in use.'),
    );
    const response = await request('POST', 'organizations', {
      name: 'Team',
      slug: 'team',
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      title: 'Conflict',
      code: 'conflict',
    });
  });

  it('publishes session security and all workspace operations in the checked-in contract', () => {
    const document = loadOpenApiDocument();
    for (const path of [
      '/platform/organizations',
      '/platform/organizations/{organizationId}',
      '/platform/organizations/{organizationId}/projects',
      '/platform/organizations/{organizationId}/projects/{projectId}',
    ]) {
      expect(document.paths[path]).toBeDefined();
    }
    expect(document.paths['/platform/organizations']?.post?.security).toEqual([
      { accountSession: [] },
    ]);
  });

  const keyPath = `organizations/${organizationId}/projects/${projectId}/api-keys`;
  const key = {
    id: randomUUID(),
    projectId,
    name: 'Server',
    prefix: 'mylx_display',
    scopes: ['api.invoke'],
    createdAt: new Date(),
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
  };
  it('creates unpredictable keys once, stores a hash, and disables caching', async () => {
    vi.mocked(repository.createApiKey).mockResolvedValue(key);
    const response = await request('POST', keyPath, {
      name: 'Server',
      scopes: ['api.invoke'],
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('private, no-store');
    const { secret } = response.json<{ secret: string }>();
    expect(secret).toMatch(/^mylx_[A-Za-z0-9_-]{43}$/);
    expect(repository.createApiKey).toHaveBeenCalledWith(
      organizationId,
      projectId,
      {
        name: 'Server',
        prefix: secret.slice(0, 13),
        keyHash: createHash('sha256').update(secret).digest('hex'),
        scopes: ['api.invoke'],
        expiresAt: null,
      },
    );
    const second = await request('POST', keyPath, {
      name: 'Server',
      scopes: ['api.invoke'],
    });
    expect(second.json().secret).not.toBe(secret);
    expect(response.json()).not.toHaveProperty('keyHash');
  });

  it.each(
    [[], ['*'], ['role.manage'], ['api.invoke', 'api.invoke']].map(
      (scopes) => ({ scopes }),
    ),
  )('rejects invalid or administrative scopes %j', async ({ scopes }) => {
    expect(
      (await request('POST', keyPath, { name: 'Key', scopes })).statusCode,
    ).toBe(400);
    expect(repository.createApiKey).not.toHaveBeenCalled();
  });

  it('rejects expired keys, unexpected fields and delegation of absent permissions', async () => {
    expect(
      (
        await request('POST', keyPath, {
          name: 'Key',
          scopes: ['api.invoke'],
          expiresAt: '2020-01-01T00:00:00Z',
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await request('POST', keyPath, {
          name: 'Key',
          scopes: ['api.invoke'],
          keyHash: 'chosen',
        })
      ).statusCode,
    ).toBe(400);
    vi.mocked(repository.getOrganization).mockResolvedValue({
      ...organization,
      permissions: ['api_key.create'],
    });
    expect(
      (await request('POST', keyPath, { name: 'Key', scopes: ['api.invoke'] }))
        .statusCode,
    ).toBe(403);
    expect(repository.createApiKey).not.toHaveBeenCalled();
  });

  it('keeps list and revocation within membership and project boundaries', async () => {
    vi.mocked(repository.listApiKeys).mockResolvedValue({
      items: [key],
      nextCursor: null,
    });
    expect((await request('GET', keyPath)).json().items[0]).not.toHaveProperty(
      'secret',
    );
    expect(repository.listApiKeys).toHaveBeenCalledWith(
      organizationId,
      projectId,
      { limit: 25 },
    );
    vi.mocked(repository.revokeApiKey).mockResolvedValue({
      ...key,
      revokedAt: new Date(),
    });
    expect(
      (await request('POST', `${keyPath}/${key.id}/revoke`, {})).statusCode,
    ).toBe(200);
    expect(repository.revokeApiKey).toHaveBeenCalledWith(
      organizationId,
      projectId,
      key.id,
      expect.any(Date),
    );
    expect(
      (await request('GET', keyPath.replace(organizationId, randomUUID())))
        .statusCode,
    ).toBe(404);
    expect(
      (await request('GET', keyPath.replace(projectId, randomUUID())))
        .statusCode,
    ).toBe(404);
    vi.mocked(repository.getOrganization).mockResolvedValue({
      ...organization,
      permissions: [],
    });
    expect((await request('GET', keyPath)).statusCode).toBe(403);
    expect(
      (await request('POST', `${keyPath}/${key.id}/revoke`, {})).statusCode,
    ).toBe(403);
  });

  it('requires a session and trusted origin for key writes', async () => {
    expect(
      (
        await request(
          'POST',
          keyPath,
          { name: 'Key', scopes: ['api.invoke'] },
          { cookie: '', authorization: 'Bearer bootstrap-test' },
        )
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await request(
          'POST',
          keyPath,
          { name: 'Key', scopes: ['api.invoke'] },
          { origin: 'https://attacker.example' },
        )
      ).statusCode,
    ).toBe(403);
    expect(
      (await request('POST', `${keyPath}/${key.id}/revoke`, {}, { origin: '' }))
        .statusCode,
    ).toBe(403);
    expect(repository.createApiKey).not.toHaveBeenCalled();
    expect(repository.revokeApiKey).not.toHaveBeenCalled();
  });
});
