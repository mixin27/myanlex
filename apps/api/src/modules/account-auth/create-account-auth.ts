import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';

import type { AccountAuthConfig } from './account-auth.config.js';

export interface AuthMail {
  to: string;
  subject: string;
  text: string;
}
export type SendAuthMail = (message: AuthMail) => Promise<void>;

export function createAccountAuth(
  config: AccountAuthConfig,
  database: BetterAuthOptions['database'],
  sendMail: SendAuthMail,
) {
  return betterAuth({
    appName: 'MyanLex',
    baseURL: config.AUTH_PUBLIC_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    database,
    trustedOrigins: [config.AUTH_PUBLIC_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Reset your MyanLex password',
          text: `Reset your password using this link:\n\n${url}\n\nIf you did not request this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Verify your MyanLex email',
          text: `Verify your email using this link:\n\n${url}`,
        });
      },
    },
    socialProviders: {
      ...(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: config.GOOGLE_CLIENT_ID,
              clientSecret: config.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: config.GITHUB_CLIENT_ID,
              clientSecret: config.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },
    account: {
      encryptOAuthTokens: true,
      accountLinking: {
        enabled: true,
        disableImplicitLinking: true,
        allowDifferentEmails: false,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60 },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: 'uuid' },
      useSecureCookies: config.AUTH_PUBLIC_URL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['x-myanlex-client-ip'] },
    },
  });
}
