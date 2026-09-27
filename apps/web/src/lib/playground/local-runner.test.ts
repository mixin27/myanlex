import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalRunner } from './local-runner';
import type { WorkerPort } from './local-runner';

function port(): WorkerPort {
  return {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
}
const request = { operation: 'normalize', payload: { text: 'က' } } as const;
afterEach(() => vi.useRealTimers());
describe('local worker lifecycle', () => {
  it('terminates on completion and does not perform HTTP traffic', async () => {
    const worker = port();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const pending = new LocalRunner(() => worker).execute(request);
    worker.onmessage?.({ data: { value: { mode: 'local' } } } as MessageEvent);
    await expect(pending).resolves.toEqual({ mode: 'local' });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it('cancels and ignores late responses; a retry creates a fresh worker', async () => {
    const first = port();
    const second = port();
    const runner = new LocalRunner(
      vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    );
    const pending = runner.execute(request);
    const rejected = expect(pending).rejects.toThrow('cancelled');
    runner.cancel();
    await rejected;
    const retry = runner.execute(request);
    first.onmessage?.({ data: { value: 'stale' } } as MessageEvent);
    first.onerror?.({} as ErrorEvent);
    first.onmessageerror?.({} as MessageEvent);
    second.onmessage?.({ data: { value: 'fresh' } } as MessageEvent);
    await expect(retry).resolves.toBe('fresh');
  });
  it('terminates at the deadline without a fallback', async () => {
    vi.useFakeTimers();
    const worker = port();
    const pending = new LocalRunner(() => worker).execute(request);
    const rejected = expect(pending).rejects.toThrow('timeout');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it('reports loading and message failures as local failures', async () => {
    await expect(
      new LocalRunner(() => {
        throw new Error('private');
      }).execute(request),
    ).rejects.toThrow('local_failure');
    const worker = port();
    const pending = new LocalRunner(() => worker).execute(request);
    const rejected = expect(pending).rejects.toThrow('local_failure');
    worker.onmessageerror?.({} as MessageEvent);
    await rejected;
  });
});
