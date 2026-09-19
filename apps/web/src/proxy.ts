import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  // Cookie presence is only an optimistic check. Server data access must still
  // validate the session; an expired or forged cookie is not authentication.
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/account/:path*',
    '/projects/:path*',
    '/api-keys/:path*',
    '/usage/:path*',
    '/documentation/:path*',
  ],
};
