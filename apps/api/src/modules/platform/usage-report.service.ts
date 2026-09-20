import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { usageQuery } from './usage-report.schemas.js';
import type {
  UsageDayRecord,
  UsageMetrics,
  UsageQuery,
} from './usage-report.schemas.js';

const DAY = 86_400_000;
export function resolveUsageRange(input: UsageQuery, now: Date) {
  const parsed = usageQuery.safeParse(input);
  if (!parsed.success)
    throw new BadRequestException(
      'Provide valid paired from and to UTC dates.',
    );
  const today = now.toISOString().slice(0, 10);
  const to = parsed.data.to ?? today;
  const from =
    parsed.data.from ??
    new Date(Date.parse(`${to}T00:00:00Z`) - 29 * DAY)
      .toISOString()
      .slice(0, 10);
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(Date.parse(`${to}T00:00:00Z`) + DAY);
  const days = (end.getTime() - start.getTime()) / DAY;
  if (days < 1 || days > 90 || to > today)
    throw new BadRequestException(
      'Choose 1–90 UTC days, ending no later than today.',
    );
  return { from, to, start, end, days };
}

function metrics(record: Omit<UsageDayRecord, 'date'>): UsageMetrics {
  const { requestCount, errorCount, charactersProcessed, processingTimeMs } =
    record;
  const rounded =
    requestCount === 0n
      ? null
      : (processingTimeMs * 100n + requestCount / 2n) / requestCount;
  return {
    requestCount: requestCount.toString(),
    errorCount: errorCount.toString(),
    charactersProcessed: charactersProcessed.toString(),
    processingTimeMs: processingTimeMs.toString(),
    averageProcessingTimeMs:
      rounded === null
        ? null
        : `${rounded / 100n}.${(rounded % 100n).toString().padStart(2, '0')}`,
  };
}

export function summarizeUsage(
  records: UsageDayRecord[],
  range: ReturnType<typeof resolveUsageRange>,
) {
  const byDate = new Map(records.map((record) => [record.date, record]));
  const totals = {
    requestCount: 0n,
    errorCount: 0n,
    charactersProcessed: 0n,
    processingTimeMs: 0n,
  };
  const days = Array.from({ length: range.days }, (_, index) => {
    const date = new Date(range.start.getTime() + index * DAY)
      .toISOString()
      .slice(0, 10);
    const record = byDate.get(date) ?? {
      date,
      requestCount: 0n,
      errorCount: 0n,
      charactersProcessed: 0n,
      processingTimeMs: 0n,
    };
    for (const field of [
      'requestCount',
      'errorCount',
      'charactersProcessed',
      'processingTimeMs',
    ] as const)
      totals[field] += record[field];
    return { date, ...metrics(record) };
  });
  return { totals: metrics(totals), days };
}

@Injectable()
export class UsageReportService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly repository: WorkspaceRepository,
  ) {}

  async report(
    userId: string,
    organizationId: string,
    projectId: string,
    query: UsageQuery,
  ) {
    const organization = await this.repository.getOrganization(
      userId,
      organizationId,
    );
    if (!organization) throw new NotFoundException('Organization not found.');
    if (!organization.permissions.includes('usage.read'))
      throw new ForbiddenException('The usage.read permission is required.');
    if (!(await this.repository.findProject(organizationId, projectId)))
      throw new NotFoundException('Project not found.');
    const now = new Date();
    const range = resolveUsageRange(query, now);
    const records = await this.repository.readUsageDays(
      organizationId,
      projectId,
      range.start,
      range.end,
    );
    return {
      projectId,
      from: range.from,
      to: range.to,
      timezone: 'UTC' as const,
      generatedAt: now.toISOString(),
      metering: 'best-effort' as const,
      ...summarizeUsage(records, range),
    };
  }
}
