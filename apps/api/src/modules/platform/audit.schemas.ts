import { z } from 'zod';
import { auditActions } from './audit.js';

const cursor = z
  .string()
  .max(200)
  .transform((value, context) => {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const [time, id, ...rest] = decoded.split('|');
    const createdAt = new Date(time ?? '');
    if (
      rest.length > 0 ||
      Number.isNaN(createdAt.getTime()) ||
      !z.uuid().safeParse(id).success
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid cursor.' });
      return z.NEVER;
    }
    return { createdAt, id: id! };
  });

export const auditQuery = z
  .object({
    cursor: cursor.optional(),
    action: z.enum(auditActions).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type AuditQueryInput = z.infer<typeof auditQuery>;

export function encodeAuditCursor(event: { createdAt: Date; id: string }) {
  return Buffer.from(`${event.createdAt.toISOString()}|${event.id}`).toString(
    'base64url',
  );
}
