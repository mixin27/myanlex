import { z } from 'zod';

// Delegable machine capabilities, not a role enumeration. Administrative
// permissions remain session-only and must never be granted to API keys.
export const delegableApiScopes = ['api.invoke'] as const;
export const apiKeyInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    scopes: z
      .array(z.enum(delegableApiScopes))
      .min(1)
      .max(delegableApiScopes.length),
    expiresAt: z.iso.datetime().optional(),
  })
  .strict();
export type ApiKeyInput = z.infer<typeof apiKeyInput>;
