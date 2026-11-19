import { z } from 'zod';

/** A UTC calendar month written as YYYY-MM. */
export const statementMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month in YYYY-MM format.')
  .refine((value) => value >= '1970-01', 'Months start at 1970-01.')
  .transform((value) => new Date(`${value}-01T00:00:00.000Z`));

export const statementQuery = z
  .object({ month: statementMonth.optional() })
  .strict();
export type StatementQuery = z.infer<typeof statementQuery>;

export const monthLabel = (monthStart: Date) =>
  monthStart.toISOString().slice(0, 7);

const formula = /^[=+\-@\t\r]/;
/** RFC 4180 field, with spreadsheet formula prefixes neutralized. */
export function csvField(value: string | number | bigint | null): string {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && formula.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
