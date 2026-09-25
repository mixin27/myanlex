// A queue timeout does not bound a command already waiting for a Redis reply.
// Expiration must close the connection, not leave detached commands accumulating.
export async function withRedisDeadline<T>(
  operation: Promise<T>,
  expire: () => void,
  timeoutMs = 2_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          try {
            expire();
          } catch {
            /* Still reject the waiting caller. */
          }
          reject(new Error('Redis response deadline exceeded.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
