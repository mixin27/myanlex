import { z } from 'zod';

export const convertTextRequestSchema = z.strictObject({
  validateSource: z.boolean().optional(),
  text: z.string(),
  from: z.enum(['unicode', 'zawgyi']),
  to: z.enum(['unicode', 'zawgyi']),
});
