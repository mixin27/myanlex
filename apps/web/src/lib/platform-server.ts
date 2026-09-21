import 'server-only';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { requireSession } from './auth-server';

export class PlatformReadError extends Error {}

export async function readPlatform<T>(path: string): Promise<T> {
  await requireSession();
  const response = await fetch(
    `${process.env.API_INTERNAL_URL ?? 'http://localhost:3001'}/v1/platform/${path}`,
    {
      headers: { cookie: (await cookies()).toString() },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  ).catch(() => {
    throw new PlatformReadError('Unable to reach the workspace service.');
  });
  if (response.status === 401) redirect('/login');
  if (response.status === 404) notFound();
  if (!response.ok)
    throw new PlatformReadError(
      'Unable to load your workspace. Please try again.',
    );
  return response.json() as Promise<T>;
}
