import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';
import { permissionCatalog } from '../apps/api/src/modules/platform/permission-catalog.js';

const environmentFile = 'apps/api/.env';
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required to seed platform data.');
}

async function main(): Promise<void> {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

  try {
    for (const [key, description] of permissionCatalog) {
      await client.permission.upsert({
        where: { key },
        create: { key, description },
        update: { description },
      });
    }

    await client.plan.upsert({
      where: { slug: 'free' },
      create: {
        name: 'Free',
        slug: 'free',
        monthlyRequestLimit: 10_000,
        monthlyCharacterLimit: 1_000_000,
      },
      update: {
        name: 'Free',
        monthlyRequestLimit: 10_000,
        monthlyCharacterLimit: 1_000_000,
      },
    });
  } finally {
    await client.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
