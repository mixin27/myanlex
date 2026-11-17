export async function writePlatform<T>(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: object,
): Promise<T> {
  const response = await fetch(`/v1/platform/${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' } }),
    credentials: 'same-origin',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Your session expired. Please sign in again.');
    const problem = (await response.json().catch(() => null)) as {
      detail?: string;
    } | null;
    throw new Error(problem?.detail ?? 'The request failed. Please try again.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
