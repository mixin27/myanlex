import { z } from 'zod';

const origin = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
}, 'Use an HTTP(S) origin without a trailing slash or path.');

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32),
    AUTH_PUBLIC_URL: origin,
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.email(),
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    NODE_ENV: z.string().optional(),
  })
  .superRefine((value, context) => {
    for (const [id, secret] of [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'],
      ['SMTP_USER', 'SMTP_PASSWORD'],
    ] as const) {
      if (Boolean(value[id]) !== Boolean(value[secret])) {
        context.addIssue({
          code: 'custom',
          path: [id],
          message: `Configure both ${id} and ${secret}.`,
        });
      }
    }
    if (
      value.NODE_ENV === 'production' &&
      !value.AUTH_PUBLIC_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_PUBLIC_URL'],
        message: 'Production authentication requires HTTPS.',
      });
    }
  });

export type AccountAuthConfig = z.infer<typeof schema>;

export function parseAccountAuthConfig(
  environment: Record<string, unknown>,
): AccountAuthConfig | undefined {
  if (
    environment.AUTH_ENABLED === undefined ||
    environment.AUTH_ENABLED === 'false'
  )
    return undefined;
  if (environment.AUTH_ENABLED !== 'true')
    throw new Error('AUTH_ENABLED must be true or false.');
  const result = schema.safeParse(environment);
  if (!result.success) {
    // Do not include config values: they may contain secrets.
    throw new Error(
      `Invalid account authentication configuration: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  return result.data;
}
