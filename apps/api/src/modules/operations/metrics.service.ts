import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry } from '@prometheus-io/client';
import { METRICS_TOKEN } from '../../common/tokens.js';
import type { RequestLogRecord } from '../../common/http/request-observability.js';

const excludedRoutes = new Set([
  '/internal/metrics',
  '/v1/health',
  '/v1/health/ready',
]);
const digest = (value: string): Buffer =>
  createHash('sha256').update(value).digest();

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly tokenHash: Buffer | undefined;
  private readonly requests = new Counter({
    name: 'myanlex_http_requests_total',
    help: 'Completed HTTP requests, excluding operational probes.',
    labelNames: ['method', 'route', 'status_code'],
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: 'myanlex_http_request_duration_seconds',
    help: 'Completed request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });
  private readonly aborted = new Counter({
    name: 'myanlex_http_requests_aborted_total',
    help: 'Observed aborted request bodies; not all disconnects.',
    labelNames: ['method', 'route'],
    registers: [this.registry],
  });

  constructor(@Inject(METRICS_TOKEN) token: string | undefined) {
    this.tokenHash =
      token === undefined ? undefined : digest(`Bearer ${token}`);
    new Gauge({
      name: 'myanlex_process_resident_memory_bytes',
      help: 'Process resident memory in bytes.',
      registers: [this.registry],
      collect() {
        this.set(process.memoryUsage.rss());
      },
    });
    new Gauge({
      name: 'myanlex_process_uptime_seconds',
      help: 'Process uptime in seconds.',
      registers: [this.registry],
      collect() {
        this.set(process.uptime());
      },
    });
  }

  get enabled(): boolean {
    return this.tokenHash !== undefined;
  }

  authorize(authorization: string | undefined): boolean {
    return (
      this.tokenHash !== undefined &&
      authorization !== undefined &&
      timingSafeEqual(this.tokenHash, digest(authorization))
    );
  }

  observe(record: RequestLogRecord): void {
    if (!this.enabled || excludedRoutes.has(record.route)) return;
    const labels = { method: record.method, route: record.route };
    if (record.statusCode === null) {
      this.aborted.inc(labels);
      return;
    }
    const completedLabels = {
      ...labels,
      status_code: String(record.statusCode),
    };
    this.requests.inc(completedLabels);
    this.duration.observe(completedLabels, record.durationMs / 1_000);
  }
}
