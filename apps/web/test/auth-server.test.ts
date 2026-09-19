import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cookieString, redirect } = vi.hoisted(() => ({
  cookieString: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ toString: cookieString }),
}));
vi.mock('next/navigation', () => ({ redirect }));

import {
  getSession,
  requireSession,
  redirectAuthenticatedUser,
} from '../src/lib/auth-server';

describe('server session redirects', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    cookieString.mockReturnValue('better-auth.session_token=test');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['', 'theme=dark'])(
    'redirects missing sessions without contacting the API (%s)',
    async (cookie) => {
      cookieString.mockReturnValue(cookie);
      await expect(requireSession()).rejects.toThrow('redirect:/login');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([null, { user: { emailVerified: false } }])(
    'rejects invalid or unverified sessions without guest-page loops',
    async (session) => {
      fetchMock.mockImplementation(async () => Response.json(session));
      await expect(requireSession()).rejects.toThrow('redirect:/login');
      redirect.mockClear();
      await redirectAuthenticatedUser();
      expect(redirect).not.toHaveBeenCalled();
    },
  );

  it('redirects verified signed-in users away from login and registration', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ user: { emailVerified: true } }),
    );
    await expect(redirectAuthenticatedUser()).rejects.toThrow(
      'redirect:/dashboard',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/get-session?disableRefresh=true'),
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('fails closed on API failure without treating it as a valid session', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(getSession()).rejects.toThrow('Unable to verify your session');
    expect(redirect).not.toHaveBeenCalled();
  });
});
