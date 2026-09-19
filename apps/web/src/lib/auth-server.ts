import 'server-only';

import { getSessionCookie } from 'better-auth/cookies';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';

const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

export const getSession = cache(async () => {
  const cookie = (await cookies()).toString();
  if (!getSessionCookie(new Headers({ cookie }))) return null;
  const response = await fetch(
    `${apiOrigin}/api/auth/get-session?disableRefresh=true`,
    {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new Error('Unable to verify your session. Please try again.');
  const session = (await response.json()) as {
    user: { id: string; name: string; email: string; emailVerified: boolean };
  } | null;
  return session?.user.emailVerified ? session : null;
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function redirectAuthenticatedUser() {
  if (await getSession()) redirect('/dashboard');
}

export async function getAuthProviders(): Promise<{
  enabled: boolean;
  providers: ('google' | 'github')[];
}> {
  try {
    const response = await fetch(`${apiOrigin}/api/auth/providers`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { enabled: false, providers: [] };
    return await response.json();
  } catch {
    return { enabled: false, providers: [] };
  }
}
