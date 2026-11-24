/**
 * Settings a production deployment must have (ADR 0027). Checked by the API
 * at boot and by `pnpm config:check` before migrations, when
 * MYANLEX_ENV=production. Problems name the variable, never its value.
 */
export interface ConfigProblem {
  readonly variable: string;
  readonly problem: string;
}

type Environment = Readonly<Record<string, unknown>>;

const text = (env: Environment, name: string) => {
  const value = env[name];
  return typeof value === 'string' ? value.trim() : '';
};

function httpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname !== 'localhost';
  } catch {
    return false;
  }
}

/** True when the deployment declares itself production. */
export const isProduction = (env: Environment) =>
  text(env, 'MYANLEX_ENV') === 'production';

export function productionConfigProblems(env: Environment): ConfigProblem[] {
  const problems: ConfigProblem[] = [];
  const require = (variable: string, problem = 'must be set') => {
    if (!text(env, variable)) problems.push({ variable, problem });
  };

  if (text(env, 'NODE_ENV') !== 'production')
    problems.push({ variable: 'NODE_ENV', problem: 'must be production' });

  const database = text(env, 'DATABASE_URL');
  if (!database) require('DATABASE_URL');
  else {
    let sslmode: string | null = null;
    try {
      sslmode = new URL(database).searchParams.get('sslmode');
    } catch {
      problems.push({
        variable: 'DATABASE_URL',
        problem: 'must be a valid URL',
      });
    }
    if (sslmode === 'disable')
      problems.push({
        variable: 'DATABASE_URL',
        problem: 'must not use sslmode=disable',
      });
  }

  require('REDIS_URL', 'must be set so limits are shared');
  const quotas = env.MYANLEX_QUOTAS_ENABLED;
  if (quotas !== true && text(env, 'MYANLEX_QUOTAS_ENABLED') !== 'true')
    problems.push({
      variable: 'MYANLEX_QUOTAS_ENABLED',
      problem: 'must be true',
    });
  if (text(env, 'MYANLEX_API_KEY'))
    problems.push({
      variable: 'MYANLEX_API_KEY',
      problem: 'must not be set; use persisted project keys',
    });
  require('MYANLEX_METRICS_TOKEN');

  if (text(env, 'AUTH_ENABLED') !== 'true')
    problems.push({ variable: 'AUTH_ENABLED', problem: 'must be true' });
  if (text(env, 'AUTH_SECRET').length < 32)
    problems.push({
      variable: 'AUTH_SECRET',
      problem: 'must be at least 32 characters',
    });
  if (!httpsUrl(text(env, 'AUTH_PUBLIC_URL')))
    problems.push({
      variable: 'AUTH_PUBLIC_URL',
      problem: 'must be a public https:// URL',
    });

  for (const variable of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_FROM'])
    require(variable, 'must be set so account and billing email is sent');

  require('MYANLEX_BILLING_PAYMENT_INSTRUCTIONS', 'must be set so invoices say how to pay');
  return problems;
}

export const describeProblems = (problems: readonly ConfigProblem[]) =>
  problems.map(({ variable, problem }) => `${variable} ${problem}`).join('; ');
