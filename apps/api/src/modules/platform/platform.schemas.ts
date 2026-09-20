import { z } from 'zod';

const name = z.string().trim().min(1).max(120);
const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const organizationInput = z.object({ name, slug }).strict();
export const projectInput = organizationInput.extend({
  environment: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
});
export const projectUpdateInput = projectInput
  .extend({ environment: z.enum(['development', 'staging', 'production']) })
  .partial()
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one project field is required.',
  );
export const listQuery = z
  .object({
    after: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type OrganizationInput = z.infer<typeof organizationInput>;
export type ProjectInput = z.infer<typeof projectInput>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateInput>;
export type ListQuery = z.infer<typeof listQuery>;
