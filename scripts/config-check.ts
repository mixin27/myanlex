import {
  describeProblems,
  isProduction,
  productionConfigProblems,
} from '../apps/api/src/common/runtime/production-config.js';
import { parseAccountAuthConfig } from '../apps/api/src/modules/account-auth/account-auth.config.js';
import { runtimeEnvironmentSchema } from '../apps/api/src/common/runtime/runtime-config.module.js';

// Validates the API environment before a deploy changes anything (the
// production stack runs it ahead of migrations). Prints variable names, never
// values. Exit 78 (EX_CONFIG) when invalid.
const issues: string[] = [];
const parsed = runtimeEnvironmentSchema.safeParse(process.env);
if (!parsed.success)
  for (const issue of parsed.error.issues)
    issues.push(`${issue.path.join('.') || 'environment'}: ${issue.message}`);
try {
  parseAccountAuthConfig(process.env);
} catch (error) {
  // These messages name variables and rules only, never values.
  issues.push(
    error instanceof Error ? error.message : 'Invalid auth configuration',
  );
}
if (isProduction(process.env)) {
  const problems = productionConfigProblems({
    ...process.env,
    ...(parsed.success ? parsed.data : {}),
  });
  if (problems.length) issues.push(describeProblems(problems));
}

if (issues.length) {
  console.error(`Configuration is invalid:\n- ${issues.join('\n- ')}`);
  process.exitCode = 78;
} else
  console.log(
    `Configuration is valid${isProduction(process.env) ? ' for production' : ''}.`,
  );
