import { randomUUID } from 'node:crypto';

import { PrismaPg } from '@prisma/adapter-pg';

import {
  PrismaClient,
  type UsageAlert,
} from '../../generated/prisma/client.js';
import type { PlanTerms } from '../../common/billing/pricing.js';
import { dueAlerts } from '../../common/billing/usage-alerts.js';
import { quotaPeriod } from '../../common/quota/quota-period.js';
import { billingContacts } from './billing-invoices.js';
import { databaseTime, readPlan } from './prisma-quota.repository.js';

/**
 * Usage alerts (docs/platform.md#usage-alerts). `scan` records newly crossed
 * thresholds for the current month, once per workspace and kind; `pending`
 * lists this month's alerts still to be emailed (new, or failed fewer than
 * MAX_ATTEMPTS times). Alerts for past months are never sent late.
 */
export const MAX_ATTEMPTS = 3;
const BATCH = 500;

export interface PendingUsageAlert {
  readonly alert: UsageAlert;
  readonly organizationName: string;
  readonly plan: PlanTerms;
  readonly resetsAt: Date;
}

export class UsageAlerts {
  private readonly client: PrismaClient;

  constructor(databaseUrl: string) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 5_000,
      }),
    });
  }

  close() {
    return this.client.$disconnect();
  }

  contacts(organizationId: string) {
    return billingContacts(this.client, organizationId);
  }

  /** Records thresholds crossed this month. Returns how many were new. */
  async scan(): Promise<number> {
    let created = 0;
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const batch = await this.client.$transaction(async (tx) => {
        const now = await databaseTime(tx);
        const { monthStart } = quotaPeriod(now);
        const rows = await tx.$queryRaw<
          { organizationId: string; requests: bigint; characters: bigint }[]
        >`
          SELECT organization_id AS "organizationId",
                 request_count AS requests, character_count AS characters
          FROM organization_quotas
          WHERE month_start = ${monthStart.toISOString()}::timestamptz
            AND (request_count > 0 OR character_count > 0)
            AND organization_id > ${after}::uuid
          ORDER BY organization_id
          LIMIT ${BATCH}`;
        let inserted = 0;
        for (const row of rows) {
          const plan = await readPlan(tx, row.organizationId, now);
          for (const due of dueAlerts(plan, row)) {
            inserted += await tx.$executeRaw`
              INSERT INTO usage_alerts (id, organization_id, month_start, kind, dimension,
                used, threshold_value, limit_value, plan_slug, created_at)
              VALUES (${randomUUID()}::uuid, ${row.organizationId}::uuid,
                ${monthStart.toISOString()}::timestamptz, ${due.kind}, ${due.dimension},
                ${due.used}, ${due.threshold}, ${due.limit}, ${plan.slug},
                ${now.toISOString()}::timestamptz)
              ON CONFLICT (organization_id, month_start, kind) DO NOTHING`;
          }
        }
        return { rows, inserted };
      });
      created += batch.inserted;
      if (batch.rows.length < BATCH) return created;
      after = batch.rows.at(-1)!.organizationId;
    }
  }

  /** This month's unsent alerts, oldest first, with what their email needs. */
  async pending(): Promise<PendingUsageAlert[]> {
    return this.client.$transaction(async (tx) => {
      const now = await databaseTime(tx);
      const { monthStart, resetsAt } = quotaPeriod(now);
      const alerts = await tx.usageAlert.findMany({
        where: {
          monthStart,
          sentAt: null,
          attempts: { lt: MAX_ATTEMPTS },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH,
      });
      const result: PendingUsageAlert[] = [];
      for (const alert of alerts) {
        const organization = await tx.organization.findUniqueOrThrow({
          where: { id: alert.organizationId },
          select: { name: true },
        });
        result.push({
          alert,
          organizationName: organization.name,
          plan: await readPlan(tx, alert.organizationId, now),
          resetsAt,
        });
      }
      return result;
    });
  }

  async markSent(id: string) {
    await this.client.usageAlert.update({
      where: { id },
      data: { sentAt: new Date(), attempts: { increment: 1 } },
    });
  }

  async markFailed(id: string) {
    await this.client.usageAlert.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  /** Deletes alerts for months before `before` (kept with the usage ledger). */
  cleanup(before: Date) {
    return this.client.usageAlert.deleteMany({
      where: { monthStart: { lt: before } },
    });
  }
}
