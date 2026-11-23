import { z } from 'zod';

export const planChangeInput = z
  .object({
    planSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    timing: z.enum(['now', 'next_month']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type PlanChangeBody = z.infer<typeof planChangeInput>;
