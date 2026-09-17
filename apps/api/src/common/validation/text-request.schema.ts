import { z } from 'zod';

export const textRequestSchema = z.strictObject({
  text: z.string(),
});
