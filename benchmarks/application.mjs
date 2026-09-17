/* global console */

import { Buffer } from 'node:buffer';
import process from 'node:process';
import { performance } from 'node:perf_hooks';

import { createApiApplication } from '../apps/api/dist/create-api-application.js';
import { createMyanLexApplication } from '../packages/application/dist/index.js';

const application = createMyanLexApplication();
let observedResults = 0;

function utf8SizedText(bytes) {
  const unit = 'မြန်မာ';
  const unitBytes = Buffer.byteLength(unit);
  const repetitions = Math.floor(bytes / unitBytes);
  const remainder = bytes - repetitions * unitBytes;
  return unit.repeat(repetitions) + 'a'.repeat(remainder);
}

function characterSizedText(characters) {
  const unit = [...'မြန်မာ'];
  return Array.from(
    { length: characters },
    (_, index) => unit[index % unit.length],
  ).join('');
}

function percentile(sorted, percentage) {
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * percentage) - 1,
  );
  return sorted[index];
}

function formatBytes(bytes) {
  const sign = bytes < 0 ? '-' : '';
  return `${sign}${(Math.abs(bytes) / 1_048_576).toFixed(2)} MiB`;
}

async function runCase({ name, iterations, warmup, operation }) {
  for (let index = 0; index < warmup; index += 1) await operation();

  globalThis.gc?.();
  const memoryBefore = process.memoryUsage();
  let peakRss = memoryBefore.rss;
  const cpuBefore = process.cpuUsage();
  const wallStarted = performance.now();
  const samples = [];

  for (let index = 0; index < iterations; index += 1) {
    const started = performance.now();
    observedResults += await operation();
    samples.push(performance.now() - started);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }

  const wallMs = performance.now() - wallStarted;
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  samples.sort((left, right) => left - right);

  return {
    name,
    iterations,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
    requestsPerSecond: (iterations * 1_000) / wallMs,
    cpuMs: (cpu.user + cpu.system) / 1_000,
    heapDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
    peakRssDelta: peakRss - memoryBefore.rss,
  };
}

const singleCases = [
  {
    name: 'syllabify / 100 characters',
    text: characterSizedText(100),
    iterations: 500,
  },
  { name: 'syllabify / 1 KiB', text: utf8SizedText(1_024), iterations: 200 },
  { name: 'syllabify / 10 KiB', text: utf8SizedText(10_240), iterations: 50 },
  { name: 'syllabify / 100 KiB', text: utf8SizedText(102_400), iterations: 10 },
];

const results = [];

for (const { name, text, iterations } of singleCases) {
  results.push(
    await runCase({
      name: `application / ${name}`,
      iterations,
      warmup: Math.min(10, iterations),
      operation: () => application.syllabifyText({ text }).segments.length,
    }),
  );
}

const batchItems = Array.from({ length: 10 }, (_, index) => ({
  id: String(index),
  text: utf8SizedText(100_000),
}));

results.push(
  await runCase({
    name: 'application / batch syllabify / 1 MB text',
    iterations: 3,
    warmup: 1,
    operation: () =>
      application.batchSyllabify({ items: batchItems }).results.length,
  }),
);

const api = await createApiApplication({
  apiKey: 'benchmark-key',
  logger: false,
  rateLimitMaxRequests: 10_000,
  rateLimitWindowMs: 3_600_000,
  serviceVersion: 'benchmark',
});

async function injectSyllabification(payload) {
  const response = await api.inject({
    method: 'POST',
    url: '/v1/syllabify',
    headers: { authorization: 'Bearer benchmark-key' },
    payload,
  });

  if (response.statusCode !== 200) {
    throw new Error(
      `Benchmark request failed with HTTP ${response.statusCode}.`,
    );
  }

  return response.body.length;
}

try {
  for (const { name, text, iterations } of singleCases) {
    results.push(
      await runCase({
        name: `HTTP / ${name}`,
        iterations: Math.max(3, Math.ceil(iterations / 4)),
        warmup: 3,
        operation: () => injectSyllabification({ text }),
      }),
    );
  }

  results.push(
    await runCase({
      name: 'HTTP / batch syllabify / 1 MB text',
      iterations: 3,
      warmup: 1,
      operation: async () => {
        const response = await api.inject({
          method: 'POST',
          url: '/v1/batch/syllabify',
          headers: { authorization: 'Bearer benchmark-key' },
          payload: { items: batchItems },
        });

        if (response.statusCode !== 200) {
          throw new Error(
            `Batch benchmark request failed with HTTP ${response.statusCode}.`,
          );
        }

        return response.body.length;
      },
    }),
  );
} finally {
  await api.close();
}

console.log(
  '| Case | Iterations | p50 | p95 | p99 | Requests/s | CPU | Heap delta | Peak RSS delta |',
);
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');

for (const result of results) {
  console.log(
    `| ${result.name} | ${result.iterations} | ${result.p50.toFixed(3)} ms | ${result.p95.toFixed(3)} ms | ${result.p99.toFixed(3)} ms | ${result.requestsPerSecond.toFixed(1)} | ${result.cpuMs.toFixed(1)} ms | ${formatBytes(result.heapDelta)} | ${formatBytes(result.peakRssDelta)} |`,
  );
}

if (observedResults === 0) {
  throw new Error('Benchmark operations produced no observable results.');
}
