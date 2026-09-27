import { PrismaPlaygroundRepository } from '../apps/api/src/infrastructure/database/prisma-playground.repository.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL for the intended database.');
  const repository = new PrismaPlaygroundRepository(url);
  let deleted = 0;
  try {
    for (let batch = 0; batch < 10; batch++) {
      const count = await repository.cleanup();
      deleted += count;
      if (count < 500) break;
    }
    console.log(`Removed ${deleted} expired playground snapshots.`);
  } finally {
    await repository.onApplicationShutdown();
  }
}
void main().catch(() => {
  console.error('Playground cleanup failed.');
  process.exitCode = 1;
});
