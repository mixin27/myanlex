import { afterEach, expect, it, vi } from 'vitest';
import { withRedisDeadline } from '../src/infrastructure/redis/redis-command-deadline.js';

afterEach(() => vi.useRealTimers());
it('expires a command waiting for a reply and releases its timer', async () => {
  vi.useFakeTimers();
  const expire = vi.fn();
  const result = withRedisDeadline(new Promise<never>(() => {}), expire);
  const assertion = expect(result).rejects.toThrow('response deadline');
  await vi.advanceTimersByTimeAsync(2_000);
  await assertion;
  expect(expire).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
it('does not close a healthy connection after success or immediate failure', async () => {
  vi.useFakeTimers();
  const expire = vi.fn();
  expect(await withRedisDeadline(Promise.resolve('PONG'), expire)).toBe('PONG');
  await expect(
    withRedisDeadline(Promise.reject(new Error('failed')), expire),
  ).rejects.toThrow('failed');
  await vi.advanceTimersByTimeAsync(3_000);
  expect(expire).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
