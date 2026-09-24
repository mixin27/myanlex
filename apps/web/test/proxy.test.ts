import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch as unstable_doesProxyMatch } from 'next/experimental/testing/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from '../src/proxy';

describe('portal proxy', () => {
  it.each([
    '/dashboard',
    '/account',
    '/projects/new',
    '/api-keys',
    '/usage',
    '/documentation',
  ])('protects %s with an early login redirect', (path) => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url: path })).toBe(
      true,
    );
    const response = proxy(new NextRequest(`http://localhost:3000${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/login',
    );
  });

  it.each([
    '/login',
    '/docs',
    '/register',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/api/auth/callback/google',
    '/api/auth/verify-email',
    '/_next/static/app.js',
    '/favicon.ico',
  ])('does not intercept %s', (url) => {
    expect(unstable_doesProxyMatch({ config, nextConfig: {}, url })).toBe(
      false,
    );
  });

  it.each(['better-auth.session_token', '__Secure-better-auth.session_token'])(
    'leaves validation of %s to server-side session checks',
    (name) => {
      const request = new NextRequest('https://myanlex.example/dashboard', {
        headers: { cookie: `${name}=untrusted-token` },
      });
      expect(proxy(request).headers.get('x-middleware-next')).toBe('1');
    },
  );

  it('does not accept unrelated cookies as a session', () => {
    const request = new NextRequest('http://localhost:3000/dashboard', {
      headers: { cookie: 'theme=dark' },
    });
    expect(proxy(request).status).toBe(307);
  });
});
