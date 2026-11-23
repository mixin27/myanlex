import { createTransport } from 'nodemailer';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type SendMail = (message: MailMessage) => Promise<void>;

export interface SmtpSettings {
  readonly SMTP_HOST: string;
  readonly SMTP_PORT: number;
  readonly SMTP_SECURE?: string | undefined;
  readonly SMTP_USER?: string | undefined;
  readonly SMTP_PASSWORD?: string | undefined;
  readonly SMTP_FROM: string;
  readonly NODE_ENV?: string | undefined;
}

/**
 * The application's SMTP sender, shared by account mail (the API) and
 * operator scripts. TLS is required in production.
 */
export function createSmtpSender(settings: SmtpSettings): SendMail {
  const mail = createTransport({
    host: settings.SMTP_HOST,
    port: settings.SMTP_PORT,
    secure: settings.SMTP_SECURE === 'true',
    requireTLS: settings.NODE_ENV === 'production',
    ...(settings.SMTP_USER
      ? { auth: { user: settings.SMTP_USER, pass: settings.SMTP_PASSWORD } }
      : {}),
  });
  return async (message) => {
    await mail.sendMail({ from: settings.SMTP_FROM, ...message });
  };
}

/**
 * A sender from SMTP_* environment variables, or null when they are not set
 * (scripts then skip mail). Never logs recipients or content.
 */
export function smtpSenderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SendMail | null {
  const port = Number(env.SMTP_PORT);
  if (!env.SMTP_HOST || !env.SMTP_FROM || !Number.isInteger(port) || port <= 0)
    return null;
  return createSmtpSender({
    SMTP_HOST: env.SMTP_HOST,
    SMTP_PORT: port,
    SMTP_SECURE: env.SMTP_SECURE,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASSWORD: env.SMTP_PASSWORD,
    SMTP_FROM: env.SMTP_FROM,
    NODE_ENV: env.NODE_ENV,
  });
}
