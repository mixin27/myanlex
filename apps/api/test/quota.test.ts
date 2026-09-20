import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { QuotaGuard } from '../src/common/quota/quota.guard.js';
import { quotaPeriod } from '../src/common/quota/quota-period.js';

function context(request: unknown): ExecutionContext {
  return {
    getHandler: () => context,
    getClass: () => QuotaGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('Quota policy', () => {
  it.each([
    ['2026-12-31T23:59:59.999Z', '2026-12-01T00:00:00.000Z', 1],
    ['2027-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z', 31 * 86400],
    ['2028-02-01T00:00:00.000Z', '2028-02-01T00:00:00.000Z', 29 * 86400],
    ['2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', 28 * 86400],
  ])('uses calendar boundaries for %s', (now, start, seconds) => {
    const period = quotaPeriod(new Date(now));
    expect(period.monthStart.toISOString()).toBe(start);
    expect(period.retryAfterSeconds).toBe(seconds);
  });

  it('bypasses disabled enforcement, sessions, bootstrap, and public requests', async () => {
    const consume = vi.fn();
    const reflector = new Reflector();
    const principal = { persisted: true, projectId: 'project' };
    expect(
      await new QuotaGuard(false, { consume }, reflector).canActivate(
        context({ apiKeyPrincipal: principal }),
      ),
    ).toBe(true);
    const guard = new QuotaGuard(true, { consume }, reflector);
    for (const request of [
      {},
      { accountPrincipal: { userId: 'user' } },
      { apiKeyPrincipal: { persisted: false } },
    ]) {
      expect(await guard.canActivate(context(request))).toBe(true);
    }
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(
      await guard.canActivate(context({ apiKeyPrincipal: principal })),
    ).toBe(true);
    expect(consume).not.toHaveBeenCalled();
  });

  it('counts code points, propagates denial, and sanitizes backend failures', async () => {
    const consume = vi
      .fn()
      .mockResolvedValue({ allowed: true, retryAfterSeconds: 10 });
    const guard = new QuotaGuard(true, { consume }, new Reflector());
    const request = context({
      apiKeyPrincipal: { persisted: true, projectId: 'project' },
      body: { items: [{ text: 'က😀' }, { text: 'က' }] },
    });
    expect(await guard.canActivate(request)).toBe(true);
    expect(consume).toHaveBeenCalledWith('project', 3);
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 10 });
    await expect(guard.canActivate(request)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 10,
    });
    consume.mockRejectedValue(new Error('secret connection details'));
    await expect(guard.canActivate(request)).rejects.toMatchObject({
      status: 503,
      message: 'Quota enforcement is temporarily unavailable.',
    });
  });
});
