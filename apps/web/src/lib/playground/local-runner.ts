import type {
  ExecutionRequest,
  Run,
  TextComparison,
} from '@myanlex/playground';

export interface WorkerPort {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}
export class LocalRunner {
  private worker: WorkerPort | undefined;
  private reject: ((error: Error) => void) | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly factory: () => WorkerPort) {}
  cancel(reason = 'cancelled') {
    this.worker?.terminate();
    this.worker = undefined;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.reject?.(new Error(reason));
    this.reject = undefined;
  }
  private send<T>(message: object): Promise<T> {
    this.cancel();
    return new Promise((resolve, reject) => {
      this.reject = reject;
      try {
        const worker = this.factory();
        this.worker = worker;
        this.timer = setTimeout(() => this.cancel('timeout'), 30_000);
        const failed = () => {
          if (this.worker === worker) this.cancel('local_failure');
        };
        worker.onerror = failed;
        worker.onmessageerror = failed;
        worker.onmessage = (event) => {
          if (this.worker !== worker) return;
          if (event.data.error) {
            this.cancel('local_failure');
            return;
          }
          if (this.timer) clearTimeout(this.timer);
          this.timer = undefined;
          this.reject = undefined;
          worker.terminate();
          this.worker = undefined;
          resolve(event.data.value as T);
        };
        worker.postMessage(message);
      } catch {
        this.cancel('local_failure');
      }
    });
  }
  execute(request: ExecutionRequest): Promise<Run> {
    return this.send({ type: 'execute', request });
  }
  compare(input: string, output: string): Promise<TextComparison> {
    return this.send({ type: 'compare', input, output });
  }
}
