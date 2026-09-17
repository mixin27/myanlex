import { z } from 'zod';

const batchItemSchema = z.strictObject({
  id: z.string().min(1).max(128),
  text: z.string(),
});

export const batchSyllabifyRequestSchema = z.strictObject({
  items: z.array(batchItemSchema),
});

export const batchTransliterateRequestSchema = z.strictObject({
  items: z.array(batchItemSchema),
  scheme: z.literal('ala-lc-2011'),
});
