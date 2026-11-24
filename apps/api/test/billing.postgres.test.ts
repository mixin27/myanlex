import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  PlanAdmin,
  PlanAdminError,
} from '../src/infrastructure/database/plan-admin.js';
import { PrismaQuotaRepository } from '../src/infrastructure/database/prisma-quota.repository.js';
import { PrismaUsageLedgerRepository } from '../src/infrastructure/database/prisma-usage-ledger.repository.js';
import { hashApiKey } from '../src/common/auth/api-key-authentication.service.js';
import type { StoredCharges } from '../src/common/billing/pricing.js';

const databaseUrl = process.env.MYANLEX_TEST_DATABASE_URL;
const operator = 'ops@example.test';

describe.skipIf(!databaseUrl)('Plan pricing and assignment', () => {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl! }),
  });
  const admin = new PlanAdmin(databaseUrl!);
  const quotas = new PrismaQuotaRepository(databaseUrl!);
  const ledger = new PrismaUsageLedgerRepository(databaseUrl!);
  afterAll(async () => {
    await Promise.all([
      client.$disconnect(),
      admin.close(),
      quotas.onApplicationShutdown(),
      ledger.onApplicationShutdown(),
    ]);
  });

  const plan = (overrides: Record<string, unknown> = {}) => ({
    slug: `pro-${randomUUID().slice(0, 8)}`,
    name: 'Pro',
    currency: 'MMK',
    baseFeeMinor: 50_000,
    monthlyRequestLimit: 5,
    monthlyCharacterLimit: null,
    overageMode: 'allow',
    requestBlock: 2,
    requestBlockPriceMinor: 700,
    requestCeiling: 8,
    ...overrides,
  });
  async function workspace() {
    const organization = await client.organization.create({
      data: { name: 'Billing', slug: `bill-${randomUUID()}` },
    });
    const project = await client.project.create({
      data: { organizationId: organization.id, name: 'App', slug: 'app' },
    });
    const key = await client.apiKey.create({
      data: {
        projectId: project.id,
        name: 'CI',
        prefix: `mlx_${randomUUID().slice(0, 6)}`,
        keyHash: hashApiKey(`bill-${randomUUID()}`),
      },
    });
    const meter = () =>
      quotas.meter({
        projectId: project.id,
        characters: 1,
        enforce: true,
        source: 'api_key',
        apiKeyId: key.id,
        endpoint: '/v1/text/normalize',
      });
    return { organization, project, key, meter };
  }

  it('validates plan definitions and keeps used terms fixed', async () => {
    await expect(
      admin.upsert(plan({ overageMode: 'block', requestCeiling: 8 })),
    ).rejects.toThrow('Ceilings apply only to overage plans.');
    await expect(admin.upsert(plan({ requestCeiling: 4 }))).rejects.toThrow(
      'below the allowance',
    );
    await expect(admin.upsert(plan({ currency: 'kyat' }))).rejects.toThrow();

    const definition = plan();
    expect(await admin.upsert(definition)).toBe('created');
    // Unused plans can still be repriced.
    expect(await admin.upsert({ ...definition, baseFeeMinor: 60_000 })).toBe(
      'updated',
    );
    const { organization } = await workspace();
    await admin.assign({
      organizationSlug: organization.slug,
      planSlug: definition.slug,
      actorEmail: operator,
    });
    await expect(
      admin.upsert({ ...definition, baseFeeMinor: 70_000 }),
    ).rejects.toThrow(PlanAdminError);
    // Descriptive fields stay editable.
    expect(
      await admin.upsert({
        ...definition,
        baseFeeMinor: 60_000,
        name: 'Pro (2026)',
        public: true,
      }),
    ).toBe('updated');
    // The database refuses term changes even outside the admin module.
    await expect(
      client.plan.update({
        where: { slug: definition.slug },
        data: { baseFeeMinor: 1n },
      }),
    ).rejects.toThrow();

    await admin.archive(definition.slug);
    await expect(
      admin.assign({
        organizationSlug: organization.slug,
        planSlug: definition.slug,
        actorEmail: operator,
      }),
    ).rejects.toThrow('archived');
    await expect(admin.archive('free')).rejects.toThrow(PlanAdminError);
  });

  it('assigns plans without overlapping periods and audits each change', async () => {
    const first = plan();
    const second = plan({ overageMode: 'block', requestCeiling: null });
    await admin.upsert(first);
    await admin.upsert(second);
    const { organization } = await workspace();
    const assign = (planSlug: string, startsAt?: Date) =>
      admin.assign({
        organizationSlug: organization.slug,
        planSlug,
        actorEmail: operator,
        note: 'Order 42',
        startsAt,
      });
    await expect(assign(first.slug, new Date('2020-01-01'))).rejects.toThrow(
      'past',
    );
    await assign(first.slug);
    const later = new Date(Date.now() + 86_400_000);
    await assign(second.slug, later);
    // A later schedule replaces the earlier one.
    await assign('free', new Date(later.getTime() + 1_000));
    const periods = await client.subscription.findMany({
      where: { organizationId: organization.id },
      orderBy: { startsAt: 'asc' },
      include: { plan: { select: { slug: true } } },
    });
    expect(periods.map((period) => [period.plan.slug, period.status])).toEqual([
      [first.slug, 'active'],
      [second.slug, 'active'],
    ]);
    expect(periods[0]!.endsAt).toEqual(later);
    expect(periods[1]!.endsAt).toEqual(new Date(later.getTime() + 1_000));
    expect(periods[0]!.assignedBy).toBe(operator);

    // Overlapping active periods are impossible at the database level.
    await expect(
      client.subscription.create({
        data: {
          organizationId: organization.id,
          planId: periods[0]!.planId,
          status: 'active',
          startsAt: new Date(Date.now() + 3_600_000),
        },
      }),
    ).rejects.toThrow();

    const audit = await client.auditEvent.findMany({
      where: {
        organizationId: organization.id,
        action: 'billing.plan_changed',
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((event) => event.metadata)).toMatchObject([
      { from: 'free', to: first.slug, note: 'Order 42' },
      { from: first.slug, to: second.slug },
      { from: second.slug, to: 'free' },
    ]);
    expect(audit.every((event) => event.actorEmail === operator)).toBe(true);
  });

  it('lets overage plans pass the allowance and stop at the ceiling', async () => {
    const definition = plan();
    await admin.upsert(definition);
    const { organization, meter } = await workspace();
    await admin.assign({
      organizationSlug: organization.slug,
      planSlug: definition.slug,
      actorEmail: operator,
    });
    const decisions = await Promise.all(
      Array.from({ length: 50 }, () => meter()),
    );
    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(8);
    const snapshot = await quotas.read(organization.id);
    expect(snapshot.requestCount).toBe(8n);
    expect(snapshot.plan.overageMode).toBe('allow');

    const billing = await ledger.billing(organization.id);
    expect(billing.plan.slug).toBe(definition.slug);
    expect(billing.month.charges).toMatchObject({
      currency: 'MMK',
      baseFeeMinor: '50000',
      requests: { units: '3', blocks: '2', amountMinor: '1400' },
      totalMinor: '51400',
    });
    expect(billing.subscriptions).toHaveLength(1);
  });

  it('prices closed months, including paid months without traffic', async () => {
    const definition = plan();
    await admin.upsert(definition);
    const row = await client.plan.findUniqueOrThrow({
      where: { slug: definition.slug },
    });
    const { organization, project, key } = await workspace();
    const quiet = await workspace();
    for (const organizationId of [organization.id, quiet.organization.id])
      await client.subscription.create({
        data: {
          organizationId,
          planId: row.id,
          status: 'active',
          startsAt: new Date('2020-01-01T00:00:00Z'),
          createdAt: new Date('2020-01-01T00:00:00Z'),
        },
      });
    const month = new Date('2026-03-01T00:00:00Z');
    await client.organizationQuota.create({
      data: {
        organizationId: organization.id,
        monthStart: month,
        requestCount: 7n,
        characterCount: 7n,
      },
    });
    await client.usageEvent.createMany({
      data: Array.from({ length: 7 }, (_, index) => ({
        id: randomUUID(),
        organizationId: organization.id,
        projectId: project.id,
        apiKeyId: key.id,
        source: 'api_key',
        monthStart: month,
        characters: 1n,
        endpoint: '/v1/text/normalize',
        createdAt: new Date(month.getTime() + index * 1000),
      })),
    });

    // Each call closes one batch; other tests may leave months pending too.
    while ((await ledger.closeFinishedMonths()).length === 500);
    const busy = await client.usageStatement.findUniqueOrThrow({
      where: {
        organizationId_monthStart: {
          organizationId: organization.id,
          monthStart: month,
        },
      },
    });
    expect(busy.charges as unknown as StoredCharges).toMatchObject({
      requests: { units: '2', blocks: '1', amountMinor: '700' },
      totalMinor: '50700',
    });
    expect(busy.plan).toMatchObject({ slug: definition.slug, currency: 'MMK' });

    const quietMonths = await client.usageStatement.findMany({
      where: { organizationId: quiet.organization.id },
      orderBy: { monthStart: 'asc' },
    });
    // Every finished month since the subscription was recorded, each at the base fee.
    expect(quietMonths[0]!.monthStart).toEqual(
      new Date('2020-01-01T00:00:00Z'),
    );
    expect(quietMonths.length).toBeGreaterThan(70);
    expect(
      quietMonths.every(
        (statement) =>
          statement.requestCount === 0n &&
          (statement.charges as unknown as StoredCharges).totalMinor ===
            '50000',
      ),
    ).toBe(true);
    const statement = await ledger.statement(quiet.organization.id, month);
    expect(statement.status).toBe('closed');
    expect(statement.charges?.totalMinor).toBe('50000');
  });

  async function requester() {
    const user = await client.user.create({
      data: {
        name: 'Owner',
        email: `owner-${randomUUID()}@example.test`,
        emailVerified: true,
      },
    });
    return { userId: user.id, email: user.email };
  }
  async function paidWorkspace() {
    const pro = plan({ public: true });
    // Dearer than Pro, so it is an upgrade that may start now (ADR 0026).
    const team = plan({
      public: true,
      overageMode: 'block',
      requestCeiling: null,
      baseFeeMinor: 90_000,
    });
    await admin.upsert(pro);
    await admin.upsert(team);
    const ws = await workspace();
    await admin.assign({
      organizationSlug: ws.organization.slug,
      planSlug: pro.slug,
      actorEmail: operator,
    });
    return { ...ws, pro, team, actor: await requester() };
  }

  it('allows one open change per workspace, even under concurrent requests', async () => {
    const { organization, team, actor } = await paidWorkspace();
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        ledger.requestPlanChange(organization.id, actor, {
          planSlug: team.slug,
          timing: 'now',
        }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const result of results.filter((r) => r.status === 'rejected'))
      expect((result as PromiseRejectedResult).reason).toMatchObject({
        code: 'open_change',
      });
    const open = await client.planChange.findMany({
      where: { organizationId: organization.id },
    });
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      channel: 'approval',
      status: 'pending',
      requesterUserId: actor.userId,
    });
  });

  it('refuses unavailable and current plans', async () => {
    const { organization, pro, actor } = await paidWorkspace();
    const hidden = plan();
    await admin.upsert(hidden);
    for (const planSlug of [pro.slug, hidden.slug, 'no-such-plan'])
      await expect(
        ledger.requestPlanChange(organization.id, actor, {
          planSlug,
          timing: 'now',
        }),
      ).rejects.toMatchObject({
        code: planSlug === pro.slug ? 'current_plan' : 'unknown_plan',
      });
  });

  it('applies approved changes now or from next month, never in the past', async () => {
    const { organization, team, actor } = await paidWorkspace();
    const later = await ledger.requestPlanChange(organization.id, actor, {
      planSlug: team.slug,
      timing: 'next_month',
      note: 'PO 42',
    });
    const nextMonth = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1),
    );
    expect(later.requestedStartsAt).toEqual(nextMonth);
    const applied = await admin.approveChange({
      changeId: later.id,
      actorEmail: operator,
    });
    expect(applied.startsAt).toEqual(nextMonth);
    expect(applied.startedEarly).toBe(false);
    const stored = await client.planChange.findUniqueOrThrow({
      where: { id: later.id },
      include: { subscription: true },
    });
    expect(stored).toMatchObject({ status: 'applied', decidedBy: operator });
    expect(stored.subscription?.startsAt).toEqual(nextMonth);
    // Approving twice is refused.
    await expect(
      admin.approveChange({ changeId: later.id, actorEmail: operator }),
    ).rejects.toThrow('already applied');

    // A next-month request approved after its date starts on approval.
    const other = await paidWorkspace();
    const late = await ledger.requestPlanChange(
      other.organization.id,
      other.actor,
      {
        planSlug: other.team.slug,
        timing: 'next_month',
      },
    );
    await client.$executeRaw`
      UPDATE plan_changes SET requested_starts_at = now() - interval '1 day'
      WHERE id = ${late.id}::uuid`;
    const early = await admin.approveChange({
      changeId: late.id,
      actorEmail: operator,
    });
    expect(early.startedEarly).toBe(true);
    expect(early.startsAt.getTime()).toBeGreaterThan(Date.now() - 60_000);

    const audit = await client.auditEvent.findMany({
      where: { organizationId: organization.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(audit.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        'billing.plan_change_requested',
        'billing.plan_changed',
        'billing.plan_change_applied',
      ]),
    );
  });

  it('rejects and cancels pending changes, and keeps archived plans pending', async () => {
    const { organization, team, actor } = await paidWorkspace();
    const first = await ledger.requestPlanChange(organization.id, actor, {
      planSlug: team.slug,
      timing: 'now',
    });
    const cancelled = await ledger.cancelPlanChange(
      organization.id,
      first.id,
      actor,
    );
    expect(cancelled.status).toBe('cancelled');
    await expect(
      ledger.cancelPlanChange(organization.id, first.id, actor),
    ).rejects.toMatchObject({ code: 'not_open' });
    await expect(
      ledger.cancelPlanChange(randomUUID(), first.id, actor),
    ).rejects.toMatchObject({ code: 'not_found' });

    const second = await ledger.requestPlanChange(organization.id, actor, {
      planSlug: team.slug,
      timing: 'now',
    });
    await expect(
      admin.rejectChange({
        changeId: second.id,
        actorEmail: operator,
        reason: ' ',
      }),
    ).rejects.toThrow('reason');
    const rejected = await admin.rejectChange({
      changeId: second.id,
      actorEmail: operator,
      reason: 'Annual agreement needed first',
    });
    expect(rejected).toMatchObject({
      status: 'rejected',
      decisionNote: 'Annual agreement needed first',
    });

    const third = await ledger.requestPlanChange(organization.id, actor, {
      planSlug: team.slug,
      timing: 'now',
    });
    await admin.archive(team.slug);
    await expect(
      admin.approveChange({ changeId: third.id, actorEmail: operator }),
    ).rejects.toThrow('archived');
    expect(
      (await client.planChange.findUniqueOrThrow({ where: { id: third.id } }))
        .status,
    ).toBe('pending');
    const overview = await ledger.billing(organization.id);
    expect(overview.changes.map((change) => change.status)).toEqual([
      'pending',
      'rejected',
      'cancelled',
    ]);
  });

  it('enforces channel, status and change-policy rules in the database', async () => {
    const { organization, pro } = await paidWorkspace();
    const planId = (
      await client.plan.findUniqueOrThrow({ where: { slug: pro.slug } })
    ).id;
    const base = {
      organizationId: organization.id,
      fromPlanSlug: 'free',
      planId,
      timing: 'now',
      requesterEmail: 'x@example.test',
    };
    await expect(
      client.planChange.create({
        data: { ...base, channel: 'approval', status: 'awaiting_payment' },
      }),
    ).rejects.toThrow();
    await expect(
      client.planChange.create({
        data: { ...base, channel: 'approval', status: 'applied' },
      }),
    ).rejects.toThrow();
    await expect(
      client.planChange.create({
        data: {
          ...base,
          channel: 'approval',
          status: 'pending',
          timing: 'next_month',
        },
      }),
    ).rejects.toThrow();
    // change_policy is descriptive: editable on a used plan.
    await client.plan.update({
      where: { slug: pro.slug },
      data: { changePolicy: 'self_service' },
    });
    await expect(
      admin.upsert({ ...pro, changePolicy: 'self_service' }),
    ).rejects.toThrow('payment provider');
  });
});
