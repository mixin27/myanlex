import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { createMyanLexApplication } from '@myanlex/application';
import { executeLocal, operations } from '@myanlex/playground';
import type { ExecutionRequest } from '@myanlex/playground';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';
import { PlaygroundService } from '../src/modules/playground/playground.service.js';

const user = randomUUID();
const org = randomUUID();
const project = randomUUID();
const origin = 'http://localhost:3000';
const body = { operation: 'normalize', payload: { text: 'က😀' } };
describe('playground HTTP admission', () => {
  let app: NestFastifyApplication;
  const getSession = vi.fn();
  const membership = vi.fn();
  const findProject = vi.fn();
  const consume = vi.fn();
  const burst = vi.fn();
  const recordUsage = vi.fn();
  const list = vi.fn();
  const save = vi.fn();
  const get = vi.fn();
  const rename = vi.fn();
  const remove = vi.fn();
  beforeAll(async () => {
    vi.stubEnv('AUTH_ENABLED', 'false');
    app = await createApiApplication({
      logger: false,
      apiKey: 'bootstrap-test',
    });
    Object.defineProperties(app.get(AccountAuthService), {
      auth: { value: { api: { getSession } } },
      publicURL: { value: origin },
    });
    Object.defineProperties(app.get(PlaygroundService), {
      workspace: { value: { getOrganization: membership, findProject } },
      quotas: { value: { consume } },
      quotasEnabled: { value: true },
      rateLimits: { value: { consume: burst } },
      usage: { value: { recordUsage } },
      saved: { value: { list, save, get, rename, delete: remove } },
    });
  });
  afterAll(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    getSession.mockImplementation(async ({ headers }: { headers: Headers }) =>
      headers.get('cookie')
        ? { user: { id: user, emailVerified: true } }
        : null,
    );
    membership.mockImplementation(async (_user: string, id: string) =>
      id === org ? { permissions: ['project.read', 'api.invoke'] } : null,
    );
    findProject.mockImplementation(async (_org: string, id: string) =>
      id === project ? { id: project } : null,
    );
    consume.mockResolvedValue({ allowed: true, retryAfterSeconds: 10 });
    burst.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 99,
      retryAfterSeconds: 10,
    });
    recordUsage.mockResolvedValue(undefined);
    list.mockResolvedValue({ items: [], nextCursor: null });
  });
  const request = (
    headers: Record<string, string> = {},
    organization = org,
    projectId = project,
    payload: object = body,
  ) =>
    app.inject({
      method: 'POST',
      url: `/v1/platform/organizations/${organization}/projects/${projectId}/playground/execute`,
      headers: { cookie: 'valid', origin, ...headers },
      payload,
    });
  it('matches local and API results for all nine operations on the same build', async () => {
    const application = createMyanLexApplication();
    for (const operation of Object.keys(
      operations,
    ) as ExecutionRequest['operation'][]) {
      const payload = operation.startsWith('batch_')
        ? { items: [{ id: 'one', text: 'က😀' }] }
        : { text: 'က😀' };
      const parsed = {
        operation,
        payload: {
          ...payload,
          ...(operation.includes('transliterate')
            ? { scheme: 'ala-lc-2011' }
            : {}),
          ...(operation === 'convert'
            ? { from: 'unicode', to: 'zawgyi', validateSource: false }
            : {}),
        },
      } as ExecutionRequest;
      const local = executeLocal(application, parsed, 'test', () => 0);
      const response = await request({}, org, project, parsed);
      expect(response.statusCode).toBe(200);
      expect(response.json().result).toEqual(local.result);
      expect(response.json().profiles).toEqual(local.profiles);
    }
  });
  it('validates explicit saves without execution and rechecks creator access on owned reads', async () => {
    const snapshot = executeLocal(
      createMyanLexApplication(),
      body,
      'test',
      () => 0,
    );
    const input = { id: randomUUID(), title: 'Private', snapshot };
    const path =
      '/v1/platform/organizations/' +
      org +
      '/projects/' +
      project +
      '/playground/runs';
    save.mockResolvedValue({ ...input, projectId: project });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          headers: { cookie: 'valid', origin },
          payload: input,
        })
      ).statusCode,
    ).toBe(201);
    expect(save.mock.calls[0]?.slice(0, 2)).toEqual([user, project]);
    const malformed = await app.inject({
      method: 'POST',
      url: path,
      headers: { cookie: 'valid', origin },
      payload: { ...input, snapshot: { ...snapshot, result: {} } },
    });
    expect(malformed.statusCode).toBe(400);
    for (const payload of [
      undefined,
      { ...input, title: 'NUL\u0000' },
      { ...input, title: '\uD800' },
    ]) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: path,
            headers: { cookie: 'valid', origin },
            ...(payload === undefined ? {} : { payload }),
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(save).toHaveBeenCalledOnce();
    membership.mockResolvedValue({ permissions: ['project.read'] });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: path,
          headers: { cookie: 'valid', origin },
          payload: input,
        })
      ).statusCode,
    ).toBe(403);
    get.mockResolvedValue(null);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: path + '/' + input.id,
          headers: { cookie: 'valid' },
        })
      ).statusCode,
    ).toBe(404);
    rename.mockResolvedValue({ id: input.id, title: 'Renamed' });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: path + '/' + input.id,
          headers: { cookie: 'valid', origin },
          payload: { title: 'Renamed' },
        })
      ).statusCode,
    ).toBe(200);
    remove.mockResolvedValue(true);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: path + '/' + input.id,
          headers: { cookie: 'valid', origin },
        })
      ).statusCode,
    ).toBe(200);
    membership.mockResolvedValue(null);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: path + '/' + input.id,
          headers: { cookie: 'valid' },
        })
      ).statusCode,
    ).toBe(404);
    expect(consume).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });
  it('checks verified session and Origin before admission', async () => {
    expect((await request({ cookie: '' })).statusCode).toBe(401);
    expect(
      (await request({ origin: 'https://attacker.example' })).statusCode,
    ).toBe(403);
    getSession.mockResolvedValue({ user: { id: user, emailVerified: false } });
    expect((await request()).statusCode).toBe(403);
    expect(burst).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
  });
  it('keeps tenant boundaries and checks current permissions before quota', async () => {
    expect((await request({}, randomUUID())).statusCode).toBe(404);
    expect((await request({}, org, randomUUID())).statusCode).toBe(404);
    membership.mockResolvedValue({ permissions: ['project.read'] });
    expect((await request()).statusCode).toBe(403);
    expect(consume).not.toHaveBeenCalled();
    expect(burst).not.toHaveBeenCalled();
    membership.mockResolvedValue(null);
    expect((await request()).statusCode).toBe(404);
  });
  it('reserves and reports once with no API-key principal or payload persistence', async () => {
    const response = await request();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      mode: 'api',
      httpStatus: 200,
      result: { input: 'က😀' },
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(burst).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledExactlyOnceWith(project, 2);
    expect(recordUsage).toHaveBeenCalledOnce();
    expect(recordUsage.mock.calls[0]?.[0]).toMatchObject({
      source: 'playground',
      apiKeyId: null,
      charactersProcessed: 2,
    });
    expect(JSON.stringify(recordUsage.mock.calls)).not.toContain('က');
  });
  it('counts nested batch payloads and rejects unavailable quota without dispatch', async () => {
    expect(
      (
        await request({}, org, project, {
          operation: 'batch_syllabify',
          payload: {
            items: [
              { id: 'a', text: 'က😀' },
              { id: 'b', text: 'ab' },
            ],
          },
        })
      ).statusCode,
    ).toBe(200);
    expect(consume).toHaveBeenCalledExactlyOnceWith(project, 4);
    consume.mockRejectedValue(new Error('database secret'));
    const failed = await request();
    expect(failed.statusCode).toBe(503);
    expect(failed.body).not.toContain('secret');
    expect(recordUsage).toHaveBeenCalledOnce();
  });
  it('reads saved metadata without consuming language quota or requiring invoke', async () => {
    membership.mockResolvedValue({ permissions: ['project.read'] });
    const result = await app.inject({
      method: 'GET',
      url: `/v1/platform/organizations/${org}/projects/${project}/playground/runs`,
      headers: { cookie: 'valid' },
    });
    expect(result.statusCode).toBe(200);
    expect(list).toHaveBeenCalledOnce();
    expect(consume).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });
});
