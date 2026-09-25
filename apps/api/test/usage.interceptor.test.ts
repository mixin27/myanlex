import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { Logger, type ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { UsageInterceptor } from '../src/common/usage/usage.interceptor.js';
import type { PlatformRepository } from '../src/infrastructure/database/platform-repository.js';

import { countRequestCharacters } from '../src/common/usage/count-request-characters.js';

describe('usage measurement', () => {
  it('sanitizes persistence errors and never falls back to the raw URL', async () => {
    const recordUsage = vi
      .fn()
      .mockRejectedValue(new Error('private-database-url'));
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      const interceptor = new UsageInterceptor({
        recordUsage,
      } as unknown as PlatformRepository);
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            apiKeyPrincipal: {
              persisted: true,
              apiKeyId: 'key',
              projectId: 'project',
            },
            url: '/private-token',
            body: { text: 'secret' },
          }),
          getResponse: () => ({ statusCode: 200 }),
        }),
      } as unknown as ExecutionContext;
      await firstValueFrom(
        interceptor.intercept(context, { handle: () => of('ok') }),
      );
      await vi.waitFor(() =>
        expect(error).toHaveBeenCalledExactlyOnceWith({
          event: 'usage_persistence_failed',
        }),
      );
      expect(recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'unmatched',
          charactersProcessed: 6,
        }),
      );
      expect(JSON.stringify(recordUsage.mock.calls)).not.toContain(
        'private-token',
      );
    } finally {
      error.mockRestore();
    }
  });
  it('counts Unicode code points rather than UTF-16 code units', () => {
    expect(countRequestCharacters({ text: 'က😀' })).toBe(2);
  });

  it('counts batch item text without retaining request content', () => {
    expect(
      countRequestCharacters({
        items: [
          { id: 'one', text: 'မြန်မာ' },
          { id: 'two', text: '😀' },
        ],
      }),
    ).toBe(7);
  });
});
