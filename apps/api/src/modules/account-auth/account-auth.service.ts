import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { prismaAdapter } from 'better-auth/adapters/prisma';

import { PrismaClient } from '../../generated/prisma/client.js';
import { createSmtpSender } from '../../common/mail/smtp-transport.js';
import { parseAccountAuthConfig } from './account-auth.config.js';
import { createAccountAuth } from './create-account-auth.js';
import type { AuthMail, SendAuthMail } from './create-account-auth.js';

export type MailDelivery = 'sent' | 'failed' | 'disabled';

@Injectable()
export class AccountAuthService implements OnModuleDestroy {
  readonly auth: ReturnType<typeof createAccountAuth> | undefined;
  readonly publicURL: string | undefined;
  readonly providers: string[] = [];
  private readonly prisma: PrismaClient | undefined;
  private readonly deliver: SendAuthMail | undefined;

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
    this.deliver = createSmtpSender(settings);
    this.auth = createAccountAuth(
      settings,
      prismaAdapter(this.prisma, { provider: 'postgresql', transaction: true }),
      this.deliver,
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

  /**
   * Best-effort application mail through the account SMTP transport. Never
   * throws and never logs recipients or message content.
   */
  async sendMail(message: AuthMail): Promise<MailDelivery> {
    if (!this.deliver) return 'disabled';
    try {
      await this.deliver(message);
      return 'sent';
    } catch {
      new Logger('AccountMail').warn({ event: 'mail_delivery_failed' });
      return 'failed';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.prisma?.$disconnect();
  }
}
