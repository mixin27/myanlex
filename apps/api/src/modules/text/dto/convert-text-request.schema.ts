import { z } from 'zod';

export const convertTextRequestSchema = z.strictObject({
  text: z.string(),
  from: z.enum(['unicode', 'zawgyi']),
  to: z.enum(['unicode', 'zawgyi']),
});
