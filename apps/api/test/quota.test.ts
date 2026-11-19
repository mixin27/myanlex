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

  it('skips sessions, bootstrap keys and public routes, but meters with enforcement off', async () => {
    const meter = vi
      .fn()
      .mockResolvedValue({ allowed: true, retryAfterSeconds: 1, eventId: 'e' });
    const reflector = new Reflector();
    const principal = {
      persisted: true,
      projectId: 'project',
      apiKeyId: 'key',
    };
    const guard = new QuotaGuard(true, { meter }, reflector);
    for (const request of [
      {},
      { accountPrincipal: { userId: 'user' } },
      { apiKeyPrincipal: { persisted: false } },
    ]) {
      expect(await guard.canActivate(context(request))).toBe(true);
    }
    expect(meter).not.toHaveBeenCalled();

    const request = { apiKeyPrincipal: principal, usageEventId: undefined };
    expect(
      await new QuotaGuard(false, { meter }, reflector).canActivate(
        context(request),
      ),
    ).toBe(true);
    expect(meter).toHaveBeenCalledWith(
      expect.objectContaining({ enforce: false, apiKeyId: 'key' }),
    );
    expect(request.usageEventId).toBe('e');

    meter.mockClear();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    expect(
      await guard.canActivate(context({ apiKeyPrincipal: principal })),
    ).toBe(true);
    expect(meter).not.toHaveBeenCalled();
  });

  it('counts code points, propagates denial, and sanitizes backend failures', async () => {
    const meter = vi.fn().mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 10,
      eventId: 'e',
    });
    const guard = new QuotaGuard(true, { meter }, new Reflector());
    const request = context({
      id: 'req-1',
      routeOptions: { url: '/v1/batch/syllabify' },
      apiKeyPrincipal: {
        persisted: true,
        projectId: 'project',
        apiKeyId: 'key',
      },
      body: { items: [{ text: 'က😀' }, { text: 'က' }] },
    });
    expect(await guard.canActivate(request)).toBe(true);
    expect(meter).toHaveBeenCalledWith({
      projectId: 'project',
      characters: 3,
      enforce: true,
      source: 'api_key',
      apiKeyId: 'key',
      endpoint: '/v1/batch/syllabify',
      requestId: 'req-1',
    });
    meter.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 10,
      eventId: null,
    });
    await expect(guard.canActivate(request)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 10,
    });
    meter.mockRejectedValue(new Error('secret connection details'));
    await expect(guard.canActivate(request)).rejects.toMatchObject({
      status: 503,
      message: 'Usage metering is temporarily unavailable.',
    });
  });
});
