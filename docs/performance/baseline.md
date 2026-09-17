# Performance baseline

This baseline measures Burmese syllabification through both the
framework-independent application service and Fastify's in-memory HTTP injection
path. It covers the payload sizes required by the initial project plan without
relying on network timing.

## Reference run

- Date: 2026-09-18
- Platform: Apple Silicon arm64, Darwin 25.2.0
- Runtime: Node.js 24.21.0
- Command: `pnpm benchmark`

| Case                                     | Iterations |       p50 |       p95 |       p99 | Requests/s |     CPU | Heap delta | Peak RSS delta |
| ---------------------------------------- | ---------: | --------: | --------: | --------: | ---------: | ------: | ---------: | -------------: |
| application / syllabify / 100 characters |        500 |   0.007ms |   0.017ms |   0.028ms |   103396.6 |  13.0ms |   3.99 MiB |       0.34 MiB |
| application / syllabify / 1 KiB          |        200 |   0.038ms |   0.087ms |   0.122ms |    19787.4 |  22.9ms |   6.28 MiB |       1.84 MiB |
| application / syllabify / 10 KiB         |         50 |   0.313ms |   0.556ms |   0.568ms |     2881.4 |  35.8ms |  11.43 MiB |      17.89 MiB |
| application / syllabify / 100 KiB        |         10 |   2.630ms |   3.750ms |   3.750ms |      369.2 |  35.5ms |  17.66 MiB |      19.11 MiB |
| application / 1 MB batch                 |          3 |  29.354ms |  32.449ms |  32.449ms |       33.2 | 155.2ms |  37.27 MiB |      79.66 MiB |
| HTTP / syllabify / 100 characters        |        125 |   0.156ms |   0.337ms |   0.677ms |     5164.1 |  36.2ms |  11.07 MiB |       0.45 MiB |
| HTTP / syllabify / 1 KiB                 |         50 |   0.233ms |   0.436ms |   0.794ms |     3722.3 |  20.4ms |  10.34 MiB |       0.38 MiB |
| HTTP / syllabify / 10 KiB                |         13 |   1.293ms |   2.417ms |   2.417ms |      728.7 |  34.8ms |  17.56 MiB |       7.00 MiB |
| HTTP / syllabify / 100 KiB               |          3 |  10.669ms |  12.163ms |  12.163ms |       89.8 |  59.8ms |  38.83 MiB |      19.22 MiB |
| HTTP / 1 MB batch                        |          3 | 108.058ms | 119.462ms | 119.462ms |        9.2 | 430.7ms |  62.01 MiB |     100.52 MiB |

These numbers are a development-machine reference, not a portable guarantee or a
CI gate. Production benchmarks must include the deployed network, container,
concurrency, and observability overhead.

## Initial targets

- p95 below 100 ms for ordinary authenticated requests up to 100 KiB on
  comparable hardware.
- p95 below 250 ms for a batch containing 1 MB of text.
- Peak RSS growth below 128 MiB while processing the 1 MB reference batch.

The baseline meets these targets without a result cache. Redis or another
distributed cache must not be introduced until production-shaped benchmarks show
a concrete need and a safe cache-key/invalidation design exists.
