import { Readable } from 'node:stream';
import {
  BadRequestException,
  GoneException,
  HttpException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { USAGE_RETENTION_MONTHS } from '../../common/tokens.js';
import { WORKSPACE_REPOSITORY } from './workspace.repository.js';
import type { WorkspaceRepository } from './workspace.repository.js';
import { requireOrganizationPermission } from './organization-access.js';
import {
  USAGE_LEDGER_REPOSITORY,
  retainedSince,
  type UsageLedgerRepository,
  type UsageStatementRecord,
} from './usage-ledger.js';
import { csvField, monthLabel } from './usage-statement.schemas.js';

const pageSize = 1_000;
const csvColumns = [
  'created_at',
  'event_id',
  'request_id',
  'project_id',
  'project_name',
  'source',
  'api_key_prefix',
  'endpoint',
  'request_units',
  'characters',
];

function unavailable(cause: unknown): never {
  if (cause instanceof HttpException) throw cause;
  throw new ServiceUnavailableException(
    'Usage statements are temporarily unavailable.',
  );
}

@Injectable()
export class UsageStatementService {
  constructor(
    @Inject(WORKSPACE_REPOSITORY)
    private readonly workspace: WorkspaceRepository,
    @Inject(USAGE_LEDGER_REPOSITORY)
    private readonly ledger: UsageLedgerRepository,
    @Inject(USAGE_RETENTION_MONTHS) private readonly retentionMonths: number,
  ) {}

  /** Checks access and that the month has started; returns the current month. */
  private async admit(
    userId: string,
    organizationId: string,
    month: Date | undefined,
  ) {
    await requireOrganizationPermission(
      this.workspace,
      userId,
      organizationId,
      'usage.read',
    );
    const current = await this.ledger.currentMonth().catch(unavailable);
    const monthStart = month ?? current;
    if (monthStart > current)
      throw new BadRequestException('That month has not started yet.');
    return { current, monthStart };
  }

  async statement(userId: string, organizationId: string, month?: Date) {
    const { current, monthStart } = await this.admit(
      userId,
      organizationId,
      month,
    );
    const record = await this.ledger
      .statement(organizationId, monthStart)
      .catch(unavailable);
    return present(
      record,
      monthStart >= retainedSince(current, this.retentionMonths),
    );
  }

  async eventsCsv(userId: string, organizationId: string, month: Date) {
    const { current, monthStart } = await this.admit(
      userId,
      organizationId,
      month,
    );
    if (monthStart < retainedSince(current, this.retentionMonths))
      throw new GoneException(
        'Ledger lines for that month are past the retention period; its statement remains available.',
      );
    const ledger = this.ledger;
    async function* lines() {
      yield csvColumns.join(',') + '\r\n';
      let after: { createdAt: Date; id: string } | null = null;
      for (;;) {
        const page = await ledger.events(
          organizationId,
          monthStart,
          after,
          pageSize,
        );
        for (const event of page)
          yield [
            event.createdAt.toISOString(),
            event.id,
            event.requestId,
            event.projectId,
            event.projectName,
            event.source,
            event.apiKeyPrefix,
            event.endpoint,
            event.requestUnits,
            event.characters,
          ]
            .map(csvField)
            .join(',') + '\r\n';
        if (page.length < pageSize) return;
        const last = page.at(-1)!;
        after = { createdAt: last.createdAt, id: last.id };
      }
    }
    return {
      filename: `usage-${monthLabel(monthStart)}-${organizationId}.csv`,
      stream: Readable.from(lines()),
    };
  }
}

function present(record: UsageStatementRecord, ledgerAvailable: boolean) {
  const end = new Date(
    Date.UTC(
      record.monthStart.getUTCFullYear(),
      record.monthStart.getUTCMonth() + 1,
      1,
    ),
  );
  return {
    organizationId: record.organizationId,
    month: monthLabel(record.monthStart),
    timezone: 'UTC' as const,
    periodStart: record.monthStart.toISOString(),
    periodEnd: end.toISOString(),
    status: record.status,
    billableUnit: 'admitted-request' as const,
    generatedAt: record.generatedAt.toISOString(),
    closedAt: record.closedAt?.toISOString() ?? null,
    totals: {
      requests: record.requestCount.toString(),
      characters: record.characterCount.toString(),
      events: record.eventCount.toString(),
    },
    counter: {
      requests: record.counterRequests.toString(),
      characters: record.counterCharacters.toString(),
    },
    reconciled: record.reconciled,
    plan: record.plan,
    lines: record.lines.map((line) => ({
      projectId: line.projectId,
      projectName: line.projectName,
      source: line.source,
      apiKey: line.apiKeyId
        ? {
            id: line.apiKeyId,
            name: line.apiKeyName,
            prefix: line.apiKeyPrefix,
          }
        : null,
      requests: line.requests.toString(),
      characters: line.characters.toString(),
    })),
    ledgerAvailable,
  };
}
