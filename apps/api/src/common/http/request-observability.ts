import { performance } from 'node:perf_hooks';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';

export interface RequestLogRecord {
  readonly event: 'http_request_completed' | 'http_request_aborted';
  readonly requestId: string;
  readonly method: string;
  readonly route: string;
  readonly statusCode: number | null;
  readonly durationMs: number;
}

export type RequestLogSink = (record: RequestLogRecord) => void;

export function configureRequestObservability(
  application: NestFastifyApplication,
  sink: RequestLogSink = (record) => new Logger('HttpRequest').log(record),
  observer?: RequestLogSink,
): void {
  const server = application.getHttpAdapter().getInstance();
  const starts = new WeakMap<object, number>();
  const completed = new WeakSet<object>();
  const methods = new Set([
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
  ]);

  server.addHook('onRequest', (request, reply, done) => {
    starts.set(request, performance.now());
    reply.header('X-Request-ID', request.id);
    done();
  });

  // Only these explicitly selected fields can leave the request boundary.
  // Route templates never contain query strings, path parameters or auth tokens.
  const record = (
    request: {
      id: string;
      method: string;
      routeOptions?: { url?: string | undefined };
    },
    statusCode: number | null,
  ): void => {
    if (completed.has(request)) return;
    completed.add(request);
    const started = starts.get(request);
    const durationMs =
      started === undefined
        ? 0
        : Math.max(0, Math.round(performance.now() - started));
    const entry: RequestLogRecord = {
      event:
        statusCode === null ? 'http_request_aborted' : 'http_request_completed',
      requestId: request.id,
      method: methods.has(request.method) ? request.method : 'OTHER',
      route: request.routeOptions?.url ?? 'unmatched',
      statusCode,
      durationMs,
    };
    for (const consumer of [observer, sink]) {
      try {
        consumer?.(entry);
      } catch {
        // Exporters are independent and must never fail the request.
      }
    }
  };

  server.addHook('onResponse', (request, reply, done) => {
    record(request, reply.statusCode);
    done();
  });
  server.addHook('onRequestAbort', (request, done) => {
    record(request, null);
    done();
  });
}
