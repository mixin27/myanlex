import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { defineConfig } from 'prisma/config';

const environmentFile = 'apps/api/.env';

if (existsSync(environmentFile)) {
  loadEnvFile(environmentFile);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  ...(process.env.DATABASE_URL === undefined
    ? {}
    : { datasource: { url: process.env.DATABASE_URL } }),
});
