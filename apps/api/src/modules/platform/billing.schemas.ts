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

/** Control characters (C0 and DEL); line breaks are allowed when multiline. */
function hasControl(value: string, multiline: boolean) {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (multiline && (code === 0x0a || code === 0x0d)) continue;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

const printable = (max: number, multiline = false) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !hasControl(value, multiline),
      'Remove control characters.',
    )
    .nullable()
    .transform((value) => (value === '' ? null : value));

export const billingDetailsInput = z
  .object({
    legalName: printable(200),
    address: printable(500, true),
    taxId: printable(64),
    invoiceNote: printable(500),
  })
  .strict();
export type BillingDetailsBody = z.infer<typeof billingDetailsInput>;

export const billingEmailInput = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  })
  .strict();
export type BillingEmailBody = z.infer<typeof billingEmailInput>;

export const billingEmailConfirmInput = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
export type BillingEmailConfirmBody = z.infer<typeof billingEmailConfirmInput>;
