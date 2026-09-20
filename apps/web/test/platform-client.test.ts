import { afterEach, describe, expect, it, vi } from 'vitest';
import { writePlatform } from '../src/lib/platform-client';

describe('platform browser transport', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('sends JSON to the same-origin platform proxy without exposing API keys', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 'organization' }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      writePlatform('organizations', 'POST', { name: 'Team', slug: 'team' }),
    ).resolves.toEqual({ id: 'organization' });
    expect(fetch).toHaveBeenCalledWith('/v1/platform/organizations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name: 'Team', slug: 'team' }),
    });
  });
  it.each([
    [401, 'Your session expired'],
    [403, 'Permission denied'],
    [409, 'Slug already exists'],
  ])('shows actionable API errors (%s)', async (status, message) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ detail: message }, { status: Number(status) }),
        ),
    );
    await expect(writePlatform('organizations', 'POST', {})).rejects.toThrow(
      String(message),
    );
  });
  it('handles non-JSON failures from an unavailable proxy', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Bad gateway', { status: 502 })),
    );
    await expect(writePlatform('organizations', 'POST', {})).rejects.toThrow(
      'The request failed',
    );
  });
});
