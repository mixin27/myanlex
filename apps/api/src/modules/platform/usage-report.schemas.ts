import { z } from 'zod';

const date = z.iso
  .date()
  .refine(
    (value) => value >= '1970-01-01',
    'Dates must be on or after 1970-01-01.',
  );
export const usageQuery = z
  .object({ from: date.optional(), to: date.optional() })
  .strict()
  .refine(
    (value) => Boolean(value.from) === Boolean(value.to),
    'Supply both from and to, or neither.',
  );
export type UsageQuery = z.infer<typeof usageQuery>;
export interface UsageDayRecord {
  date: string;
  requestCount: bigint;
  errorCount: bigint;
  charactersProcessed: bigint;
  processingTimeMs: bigint;
}
export interface UsageMetrics {
  requestCount: string;
  errorCount: string;
  charactersProcessed: string;
  processingTimeMs: string;
  averageProcessingTimeMs: string | null;
}
