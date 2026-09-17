import { z } from 'zod';

export const transliterateTextRequestSchema = z.strictObject({
  text: z.string(),
  scheme: z.literal('ala-lc-2011'),
});
