import { createHash } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import type { OnApplicationShutdown } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Run } from '@myanlex/playground';
import {
  SaveConflict,
  SaveLimit,
} from '../../modules/playground/playground.repository.js';
import type {
  PlaygroundRepository,
  SaveInput,
  RunListQuery,
} from '../../modules/playground/playground.repository.js';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const metadata = {
  id: true,
  title: true,
  projectId: true,
  createdAt: true,
  expiresAt: true,
  payloadSize: true,
} as const;
function snapshot(row: {
  id: string;
  title: string;
  projectId: string;
  createdAt: Date;
  expiresAt: Date;
  payloadSize: number;
  snapshot: string;
}) {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    payloadSize: row.payloadSize,
    snapshot: JSON.parse(row.snapshot) as Run,
  };
}
export class PrismaPlaygroundRepository
  implements PlaygroundRepository, OnApplicationShutdown
{
  private readonly client: PrismaClient;
  constructor(url: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url,
        connectionTimeoutMillis: 5000,
      }),
    });
  }
  async save(
    userId: string,
    projectId: string,
    input: SaveInput,
    size: number,
  ) {
    const hash = createHash('sha256')
      .update(canonical({ title: input.title, snapshot: input.snapshot }))
      .digest('hex');
    return this.client.$transaction(async (tx) => {
      // Serialize all saves for this user across projects without a hash collision.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      const times = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const now = times[0]!.now;
      const existing = await tx.playgroundRun.findUnique({
        where: { id: input.id },
      });
      if (existing) {
        if (
          existing.creatorId !== userId ||
          existing.projectId !== projectId ||
          existing.contentHash !== hash ||
          existing.expiresAt <= now
        )
          throw new SaveConflict('Save identifier already used.');
        return snapshot(existing);
      }
      const count = await tx.playgroundRun.count({
        where: { creatorId: userId, expiresAt: { gt: now } },
      });
      if (count >= 50)
        throw new SaveLimit(
          'Delete a saved run before saving another. The limit is 50 active runs.',
        );
      const saved = await tx.playgroundRun.create({
        data: {
          id: input.id,
          creatorId: userId,
          projectId,
          title: input.title,
          snapshot: JSON.stringify(input.snapshot),
          contentHash: hash,
          payloadSize: size,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 30 * 86_400_000),
        },
      });
      return snapshot(saved);
    });
  }
  private async now() {
    const rows = await this.client.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return rows[0]!.now;
  }
  async list(userId: string, projectId: string, query: RunListQuery) {
    const rows = await this.client.playgroundRun.findMany({
      where: {
        creatorId: userId,
        projectId,
        expiresAt: { gt: await this.now() },
        ...(query.after ? { id: { gt: query.after } } : {}),
      },
      select: metadata,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const result = rows.slice(0, query.limit);
    return {
      items: result,
      nextCursor: rows.length > query.limit ? result.at(-1)!.id : null,
    };
  }
  async get(userId: string, projectId: string, id: string) {
    const row = await this.client.playgroundRun.findFirst({
      where: {
        id,
        creatorId: userId,
        projectId,
        expiresAt: { gt: await this.now() },
      },
    });
    return row ? snapshot(row) : null;
  }
  async rename(userId: string, projectId: string, id: string, title: string) {
    // Keep the original content hash for safe retries of the initial save.
    const rows = await this.client.playgroundRun.updateManyAndReturn({
      where: {
        id,
        creatorId: userId,
        projectId,
        expiresAt: { gt: await this.now() },
      },
      data: { title },
      select: metadata,
    });
    return rows[0] ?? null;
  }
  async delete(userId: string, projectId: string, id: string) {
    const result = await this.client.playgroundRun.deleteMany({
      where: {
        id,
        creatorId: userId,
        projectId,
        expiresAt: { gt: await this.now() },
      },
    });
    return result.count > 0;
  }
  async cleanup() {
    return this.client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM playground_runs WHERE expires_at <= clock_timestamp() ORDER BY expires_at LIMIT 500 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return 0;
      return (
        await tx.playgroundRun.deleteMany({
          where: { id: { in: rows.map((row) => row.id) } },
        })
      ).count;
    });
  }
  async onApplicationShutdown() {
    await this.client.$disconnect();
  }
}
