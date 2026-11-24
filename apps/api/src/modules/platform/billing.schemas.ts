import { z } from 'zod';

export const planChangeInput = z
  .object({
    planSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/),
    timing: z.enum(['now', 'next_month']),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type PlanChangeBody = z.infer<typeof planChangeInput>;

export const invoiceNumber = z.string().regex(/^MLX-[0-9]{4}-[0-9]{6}$/);
export const invoiceListQuery = z
  .object({
    before: invoiceNumber.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type InvoiceListQuery = z.infer<typeof invoiceListQuery>;
