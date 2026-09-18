import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { createTransport } from 'nodemailer';

import { PrismaClient } from '../../generated/prisma/client.js';
import { parseAccountAuthConfig } from './account-auth.config.js';
import { createAccountAuth } from './create-account-auth.js';

@Injectable()
export class AccountAuthService implements OnModuleDestroy {
  readonly auth: ReturnType<typeof createAccountAuth> | undefined;
  readonly publicURL: string | undefined;
  readonly providers: string[] = [];
  private readonly prisma: PrismaClient | undefined;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const keys = [
      'AUTH_ENABLED',
      'DATABASE_URL',
      'AUTH_SECRET',
      'AUTH_PUBLIC_URL',
      'SMTP_HOST',
      'SMTP_PORT',
      'SMTP_SECURE',
      'SMTP_USER',
      'SMTP_PASSWORD',
      'SMTP_FROM',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'GITHUB_CLIENT_ID',
      'GITHUB_CLIENT_SECRET',
      'NODE_ENV',
    ];
    const settings = parseAccountAuthConfig(
      Object.fromEntries(keys.map((key) => [key, config.get(key)])),
    );
    if (!settings) return;
    this.publicURL = settings.AUTH_PUBLIC_URL;
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: settings.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      }),
    });
    const mail = createTransport({
      host: settings.SMTP_HOST,
      port: settings.SMTP_PORT,
      secure: settings.SMTP_SECURE === 'true',
      requireTLS: settings.NODE_ENV === 'production',
      ...(settings.SMTP_USER
        ? { auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD } }
        : {}),
    });
    this.auth = createAccountAuth(
      settings,
      prismaAdapter(this.prisma, { provider: 'postgresql', transaction: true }),
      async (message) => {
        await mail.sendMail({ from: settings.SMTP_FROM, ...message });
      },
    );
    if (settings.GOOGLE_CLIENT_ID) this.providers.push('google');
    if (settings.GITHUB_CLIENT_ID) this.providers.push('github');
  }

  requireAuth() {
    if (!this.auth)
      throw new ServiceUnavailableException(
        'Account authentication is not configured.',
      );
    return this.auth;
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma?.$disconnect();
  }
}
