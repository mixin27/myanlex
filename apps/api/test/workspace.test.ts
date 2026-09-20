import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
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
              permissions: ['project.read', 'project.create', 'project.update'],
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
});
