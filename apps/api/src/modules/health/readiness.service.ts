import { performance } from 'node:perf_hooks';
import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
} from '@nestjs/common';

export const READINESS_PROBES = Symbol('READINESS_PROBES');
export interface ReadinessProbe {
  checkReady(): Promise<boolean>;
}

@Injectable()
export class ReadinessService
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private accepting = false;
  private inFlight: Promise<boolean> | undefined;
  private cached = false;
  private expiresAt = 0;

  constructor(
    @Inject(READINESS_PROBES)
    private readonly probes: readonly ReadinessProbe[],
  ) {}

  onApplicationBootstrap(): void {
    this.accepting = true;
  }
  beforeApplicationShutdown(): void {
    this.accepting = false;
  }

  async isReady(): Promise<boolean> {
    if (!this.accepting) return false;
    if (performance.now() < this.expiresAt) return this.cached;
    // One shared probe run plus a short cache prevents probe traffic from
    // exhausting dependency connections. Each adapter bounds its own IO.
    this.inFlight ??= Promise.all(
      this.probes.map(async (probe) => {
        try {
          return await probe.checkReady();
        } catch {
          return false;
        }
      }),
    )
      .then((results) => {
        this.cached = results.every(Boolean);
        this.expiresAt = performance.now() + 1_000;
        return this.cached;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    const ready = await this.inFlight;
    return this.accepting && ready;
  }
}
