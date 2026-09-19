import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { verifyPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';

import { PrismaClient } from '../src/generated/prisma/client.js';
import { parseAccountAuthConfig } from '../src/modules/account-auth/account-auth.config.js';
import { createAccountAuth } from '../src/modules/account-auth/create-account-auth.js';

const databaseURL = process.env.MYANLEX_TEST_DATABASE_URL;

describe.skipIf(!databaseURL)('account persistence in PostgreSQL', () => {
  it('registers, verifies and revokes sessions using the migrated Prisma schema', async () => {
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseURL! }),
    });
    const config = parseAccountAuthConfig({
      AUTH_ENABLED: 'true',
      DATABASE_URL: databaseURL,
      AUTH_SECRET: 'database-test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
      AUTH_PUBLIC_URL: 'http://localhost:3000',
      SMTP_HOST: 'localhost',
      SMTP_FROM: 'test@example.com',
    })!;
    const email = `auth-test-${randomUUID()}@example.com`;
    const mail: string[] = [];
    const auth = createAccountAuth(
      config,
      prismaAdapter(prisma, { provider: 'postgresql', transaction: true }),
      async (message) => {
        mail.push(message.text);
      },
    );
    const request = (path: string, body?: object, cookie?: string) =>
      auth.handler(
        new Request(new URL(path, config.AUTH_PUBLIC_URL), {
          method: body ? 'POST' : 'GET',
          headers: {
            origin: config.AUTH_PUBLIC_URL,
            'content-type': 'application/json',
            'x-myanlex-client-ip': '127.0.0.1',
            ...(cookie ? { cookie } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    try {
      const credentials = {
        name: 'Integration test',
        email,
        password: 'integration-test-password-123',
        callbackURL: '/login',
      };
      expect(
        (await request('/api/auth/sign-up/email', credentials)).status,
      ).toBe(200);
      expect(mail).toHaveLength(1);
      const account = await prisma.account.findFirstOrThrow({
        where: { user: { email }, providerId: 'credential' },
      });
      expect(account.password).toEqual(expect.any(String));
      expect(
        await verifyPassword({
          hash: account.password!,
          password: credentials.password,
        }),
      ).toBe(true);
      const user = await prisma.user.update({
        where: { email },
        data: { emailVerifiedAt: new Date() },
      });
      expect(user.passwordHash).toBeNull();
      expect(user.emailVerified).toBe(false);
      const unverified = await request('/api/auth/sign-in/email', credentials);
      expect(unverified.status).toBe(403);
      expect(await unverified.json()).toMatchObject({
        code: 'EMAIL_NOT_VERIFIED',
      });
      expect((await request(mail[0]!.match(/https?:\/\/\S+/)![0])).status).toBe(
        302,
      );
      const login = await request('/api/auth/sign-in/email', credentials);
      expect(login.status).toBe(200);
      const cookie = login.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; ');
      expect(
        await (
          await request('/api/auth/get-session', undefined, cookie)
        ).json(),
      ).toMatchObject({ user: { email, emailVerified: true } });
      expect(
        await prisma.account.count({
          where: { user: { email }, providerId: 'credential' },
        }),
      ).toBe(1);
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(
        1,
      );
      expect((await request('/api/auth/sign-out', {}, cookie)).status).toBe(
        200,
      );
      expect(await prisma.session.count({ where: { user: { email } } })).toBe(
        0,
      );
    } finally {
      await prisma.user.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });
});
