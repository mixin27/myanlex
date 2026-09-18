import 'reflect-metadata';

import { memoryAdapter } from 'better-auth/adapters/memory';
import type { MemoryDB } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';
import { createApiApplication } from '../src/create-api-application.js';
import { AccountAuthService } from '../src/modules/account-auth/account-auth.service.js';

import { parseAccountAuthConfig } from '../src/modules/account-auth/account-auth.config.js';
import { createAccountAuth } from '../src/modules/account-auth/create-account-auth.js';
import type { AuthMail } from '../src/modules/account-auth/create-account-auth.js';

const environment = {
  AUTH_ENABLED: 'true',
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  AUTH_SECRET: 'test-secret-0123456789-abcdefghijklmnopqrstuvwxyz',
  AUTH_PUBLIC_URL: 'http://localhost:3000',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM: 'auth@example.com',
};

function setup(overrides: Record<string, string> = {}) {
  const database: MemoryDB = {
    user: [],
    session: [],
    account: [],
    verification: [],
    rateLimit: [],
  };
  const mail: AuthMail[] = [];
  const auth = createAccountAuth(
    parseAccountAuthConfig({ ...environment, ...overrides })!,
    memoryAdapter(database),
    async (message) => {
      mail.push(message);
    },
  );
  async function request(
    path: string,
    body?: Record<string, unknown>,
    cookie?: string,
    origin = environment.AUTH_PUBLIC_URL,
  ) {
    return auth.handler(
      new Request(new URL(path, environment.AUTH_PUBLIC_URL), {
        method: body ? 'POST' : 'GET',
        headers: {
          'content-type': 'application/json',
          origin,
          'x-myanlex-client-ip': '127.0.0.1',
          ...(cookie ? { cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  }
  return { database, mail, auth, request };
}
const identity = {
  email: 'developer@example.com',
  password: 'correct-horse-battery-123',
  name: 'Developer',
  callbackURL: '/login',
};
function cookieOf(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
function linkOf(mail: AuthMail) {
  return mail.text.match(/https?:\/\/\S+/)![0];
}

describe('self-hosted account authentication', () => {
  it('starts configured OAuth with state and rejects unsolicited callbacks', async () => {
    const { request, database } = setup({
      GOOGLE_CLIENT_ID: 'test-client',
      GOOGLE_CLIENT_SECRET: 'test-secret',
    });
    const start = await request('/api/auth/sign-in/social', {
      provider: 'google',
      callbackURL: '/dashboard',
    });
    expect(start.status).toBe(200);
    const payload = (await start.json()) as { url: string };
    const authorization = new URL(payload.url);
    expect(authorization.hostname).toBe('accounts.google.com');
    expect(authorization.searchParams.get('state')).toBeTruthy();
    expect(authorization.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/callback/google',
    );
    const invalid = await request(
      '/api/auth/callback/google?code=invalid&state=unsolicited',
    );
    expect(invalid.status).toBe(302);
    expect(database.session).toHaveLength(0);
    expect(database.account).toHaveLength(0);
  });

  it('limits repeated sign-in attempts', async () => {
    const { request } = setup();
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 8; attempt++) {
      statuses.push(
        (await request('/api/auth/sign-in/email', identity)).status,
      );
    }
    expect(statuses).toContain(429);
  });

  it('bridges HTTP cookies, enforces origin checks and keeps API keys separate', async () => {
    const { auth } = setup();
    const application = await createApiApplication({
      apiKey: 'test-bootstrap',
      logger: false,
    });
    try {
      const service = application.get(AccountAuthService);
      Object.defineProperties(service, {
        auth: { value: auth },
        publicURL: { value: environment.AUTH_PUBLIC_URL },
      });
      const denied = await application.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: identity,
        headers: { origin: 'https://attacker.example' },
      });
      expect(denied.statusCode).toBe(403);
      const registered = await application.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: identity,
        headers: { origin: environment.AUTH_PUBLIC_URL },
      });
      expect(registered.statusCode).toBe(200);
      const session = await application.inject({
        method: 'GET',
        url: '/api/auth/get-session',
        headers: { authorization: 'Bearer test-bootstrap' },
      });
      expect(session.json()).toBeNull();
      expect(session.headers['cache-control']).toContain('no-store');
      const nlp = await application.inject({
        method: 'POST',
        url: '/v1/tokenize',
        headers: { cookie: 'better-auth.session_token=anything' },
        payload: { text: 'test' },
      });
      expect(nlp.statusCode).toBe(401);
      const oversized = await application.inject({
        method: 'POST',
        url: '/api/auth/sign-up/email',
        payload: { ...identity, name: 'x'.repeat(17000) },
        headers: { origin: environment.AUTH_PUBLIC_URL },
      });
      expect(oversized.statusCode).toBe(413);
    } finally {
      await application.close();
    }
  });

  it('requires verification, hashes passwords, persists sessions and revokes logout', async () => {
    const { request, database, mail } = setup();
    expect((await request('/api/auth/sign-up/email', identity)).status).toBe(
      200,
    );
    expect(database.session).toHaveLength(0);
    expect(database.account?.[0].password).not.toBe(identity.password);
    expect(mail).toHaveLength(1);
    expect((await request('/api/auth/sign-in/email', identity)).status).toBe(
      403,
    );
    const verified = await request(linkOf(mail[0]!));
    expect(verified.status).toBe(302);
    const login = await request('/api/auth/sign-in/email', identity);
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('HttpOnly');
    expect(login.headers.get('set-cookie')).toContain('SameSite=Lax');
    const cookie = cookieOf(login);
    expect(database.session).toHaveLength(1);
    const session = await request('/api/auth/get-session', undefined, cookie);
    expect(await session.json()).toMatchObject({
      user: { email: identity.email, emailVerified: true },
    });
    expect(
      await (
        await request(
          '/api/auth/get-session',
          undefined,
          'better-auth.session_token=forged',
        )
      ).json(),
    ).toBeNull();
    expect((await request('/api/auth/sign-out', {}, cookie)).status).toBe(200);
    expect(
      await (await request('/api/auth/get-session', undefined, cookie)).json(),
    ).toBeNull();
  });

  it('resets passwords, invalidates existing sessions and consumes reset tokens once', async () => {
    const { request, mail } = setup();
    await request('/api/auth/sign-up/email', identity);
    await request(linkOf(mail[0]!));
    const login = await request('/api/auth/sign-in/email', identity);
    const cookie = cookieOf(login);
    await request('/api/auth/request-password-reset', {
      email: identity.email,
      redirectTo: '/reset-password',
    });
    const link = new URL(linkOf(mail.at(-1)!));
    const token = link.pathname.split('/').at(-1)!;
    expect(
      (
        await request('/api/auth/reset-password', {
          token,
          newPassword: 'replacement-password-123',
        })
      ).status,
    ).toBe(200);
    expect(
      await (await request('/api/auth/get-session', undefined, cookie)).json(),
    ).toBeNull();
    expect(
      (
        await request('/api/auth/reset-password', {
          token,
          newPassword: 'another-password-123',
        })
      ).status,
    ).toBe(400);
    expect((await request('/api/auth/sign-in/email', identity)).status).toBe(
      401,
    );
    expect(
      (
        await request('/api/auth/sign-in/email', {
          ...identity,
          password: 'replacement-password-123',
        })
      ).status,
    ).toBe(200);
  });

  it('rejects untrusted origins and redirect destinations', async () => {
    const { request, database } = setup();
    expect(
      (
        await request(
          '/api/auth/sign-up/email',
          identity,
          undefined,
          'https://attacker.example',
        )
      ).status,
    ).toBe(403);
    expect(database.user).toHaveLength(0);
    expect(
      (
        await request('/api/auth/sign-up/email', {
          ...identity,
          callbackURL: 'https://attacker.example',
        })
      ).status,
    ).toBe(403);
  });

  it('expires sessions even when the signed cookie is still present', async () => {
    const { request, mail, database } = setup();
    await request('/api/auth/sign-up/email', identity);
    await request(linkOf(mail[0]!));
    const cookie = cookieOf(await request('/api/auth/sign-in/email', identity));
    database.session![0].expiresAt = new Date(0);
    expect(
      await (await request('/api/auth/get-session', undefined, cookie)).json(),
    ).toBeNull();
  });

  it('requires explicit linking and encrypts OAuth tokens', () => {
    const { auth } = setup();
    expect(auth.options.account?.accountLinking).toMatchObject({
      disableImplicitLinking: true,
      allowDifferentEmails: false,
    });
    expect(auth.options.account?.encryptOAuthTokens).toBe(true);
  });

  it('rejects weak secrets, incomplete providers and insecure production origins', () => {
    expect(parseAccountAuthConfig({})).toBeUndefined();
    for (const overrides of [
      { AUTH_SECRET: 'short' },
      { GOOGLE_CLIENT_ID: 'id-only' },
      { NODE_ENV: 'production' },
      { SMTP_HOST: undefined },
      { AUTH_ENABLED: 'yes' },
    ])
      expect(() =>
        parseAccountAuthConfig({ ...environment, ...overrides }),
      ).toThrow();
  });
});
