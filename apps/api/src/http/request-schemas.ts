import { z } from 'zod';

export const textRequestSchema = z.strictObject({
  text: z.string(),
});

export const convertTextRequestSchema = z.strictObject({
  text: z.string(),
  from: z.enum(['unicode', 'zawgyi']),
  to: z.enum(['unicode', 'zawgyi']),
});

export const transliterateTextRequestSchema = z.strictObject({
  text: z.string(),
  scheme: z.literal('ala-lc-2011'),
});

export type TextRequestBody = z.infer<typeof textRequestSchema>;
export type ConvertTextRequestBody = z.infer<typeof convertTextRequestSchema>;
export type TransliterateTextRequestBody = z.infer<
  typeof transliterateTextRequestSchema
>;
