import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../apps/api/src/generated/prisma/client.js';

const environmentFile = 'apps/api/.env';
if (existsSync(environmentFile)) loadEnvFile(environmentFile);

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required to seed platform data.');
}

const permissions = [
  ['api.invoke', 'Call MyanLex language-processing operations.'],
  ['project.read', 'View projects in an organization.'],
  ['project.create', 'Create projects in an organization.'],
  ['project.update', 'Update projects in an organization.'],
  ['project.delete', 'Delete projects in an organization.'],
  ['api_key.read', 'View API-key metadata.'],
  ['api_key.create', 'Create API keys.'],
  ['api_key.revoke', 'Revoke API keys.'],
  ['usage.read', 'View project usage and aggregates.'],
  ['role.read', 'View roles and their permissions.'],
  ['role.manage', 'Create and change roles and permissions.'],
  ['member.read', 'View organization members.'],
  ['member.manage', 'Invite, update, and remove organization members.'],
  ['billing.read', 'View plan and subscription details.'],
  ['billing.manage', 'Change plan and subscription settings.'],
] as const;

const client = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  for (const [key, description] of permissions) {
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
