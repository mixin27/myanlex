import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { readPlatform } from '@/lib/platform-server';
import type {
  BillingOverview,
  ChangePreview,
  InvoicePage,
  Organization,
  OrganizationAccess,
  Page,
} from '@/lib/platform-types';
import { OrganizationPicker } from '@/components/workspace/organization-picker';
import {
  ChangeHistory,
  PlanCard,
  PlanHistory,
} from '@/components/billing/plan-summary';
import {
  OpenChangeBanner,
  RequestPlanButton,
} from '@/components/billing/plan-change';
import { BillingAlerts, InvoiceList } from '@/components/billing/invoices';
import { ChargesTable } from '@/components/billing/charges';
import { formatUsageCount } from '@/lib/usage-range';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string; organizationsAfter?: string }>;
}) {
  const params = await searchParams;
  for (const value of Object.values(params))
    if (value !== undefined && !z.uuid().safeParse(value).success) notFound();
  const organizations = await readPlatform<Page<Organization>>(
    `organizations${params.organizationsAfter ? `?after=${params.organizationsAfter}` : ''}`,
  );
  const organizationId = params.organization ?? organizations.items[0]?.id;
  const organization = organizationId
    ? await readPlatform<OrganizationAccess>(`organizations/${organizationId}`)
    : null;
  const choices =
    organization &&
    !organizations.items.some((item) => item.id === organization.id)
      ? [organization, ...organizations.items]
      : organizations.items;
  const canRead = organization?.permissions.includes('billing.read') ?? false;
  const billing =
    organization && canRead
      ? await readPlatform<BillingOverview>(
          `organizations/${organization.id}/billing`,
        )
      : null;
  const invoices =
    organization && billing
      ? await readPlatform<InvoicePage>(
          `organizations/${organization.id}/billing/invoices?limit=12`,
        )
      : null;
  const contact = process.env.MYANLEX_BILLING_CONTACT?.trim();
  const others = billing?.publicPlans.filter(
    (plan) => plan.slug !== billing.plan.slug,
  );
  // Requests are allowed for members with billing.manage and no open change.
  const canRequest = Boolean(billing?.canRequestChange && !billing.openChange);
  const generated = billing ? new Date(billing.generatedAt) : new Date();
  const nextMonthStart = new Date(
    Date.UTC(generated.getUTCFullYear(), generated.getUTCMonth() + 1, 1),
  ).toISOString();
  const requestButton = (
    plan: { slug: string; name: string },
    change: ChangePreview,
    label?: string,
  ) =>
    organization && canRequest ? (
      <RequestPlanButton
        organizationId={organization.id}
        plan={plan}
        change={change}
        nextMonthStart={nextMonthStart}
        {...(label ? { label } : {})}
      />
    ) : null;
  return (
    <div className="space-y-6">
      <header className="page-heading">
        <h1>Billing</h1>
        <p>
          Your workspace’s plan, this month’s charges so far and its plan
          history.
        </p>
      </header>
      {choices.length > 0 && (
        <OrganizationPicker
          organizations={choices}
          selected={organization?.id}
        />
      )}
      {organizations.nextCursor && (
        <Link
          className="text-xs underline"
          href={`/billing?organizationsAfter=${organizations.nextCursor}`}
        >
          More workspaces
        </Link>
      )}
      {!organization ? (
        <section className="rounded-xl border bg-white p-8">
          <h2 className="font-semibold">No workspace yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a workspace to see its plan.
          </p>
        </section>
      ) : !billing ? (
        <section className="rounded-xl border bg-white p-8">
          <h2 className="font-semibold">Access restricted</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role in {organization.name} does not include the billing.read
            permission. Ask a workspace Owner for access.
          </p>
        </section>
      ) : (
        <>
          <BillingAlerts
            organizationId={organization.id}
            outstanding={billing.outstanding}
            suspended={billing.suspended}
            paymentInstructions={billing.paymentInstructions}
          />
          {billing.openChange && (
            <OpenChangeBanner
              organizationId={organization.id}
              change={billing.openChange}
              canManage={billing.canRequestChange}
            />
          )}
          <PlanCard
            plan={billing.plan}
            action={
              billing.plan.slug !== 'free'
                ? requestButton(
                    { slug: 'free', name: 'Free' },
                    billing.freeChange,
                    'Switch to Free',
                  )
                : null
            }
          />
          <section
            aria-labelledby="month-heading"
            className="space-y-3 rounded-xl border bg-white p-5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="month-heading" className="font-semibold">
                This month so far
              </h2>
              <span className="rounded-full border px-2 py-0.5 text-xs">
                Estimate
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatUsageCount(billing.currentMonth.totals.requests)} requests
              and {formatUsageCount(billing.currentMonth.totals.characters)}{' '}
              characters in {billing.currentMonth.month} (UTC). Base fees are
              invoiced in advance; overage is invoiced after the month closes.
            </p>
            <ChargesTable charges={billing.currentMonth.charges} />
            <p className="text-xs text-muted-foreground">
              <Link
                className="font-medium underline"
                href={`/usage?organization=${organization.id}`}
              >
                Monthly statements
              </Link>{' '}
              list each closed month’s charges and every billable request.
            </p>
          </section>
          {invoices && (
            <InvoiceList
              organizationId={organization.id}
              invoices={invoices.items}
            />
          )}
          <PlanHistory periods={billing.subscriptions} />
          <ChangeHistory changes={billing.changes} />
          {others && others.length > 0 && (
            <section aria-labelledby="plans-heading" className="space-y-3">
              <h2 id="plans-heading" className="font-semibold">
                Other plans
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {others.map((plan) => (
                  <PlanCard
                    key={plan.slug}
                    plan={plan}
                    compact
                    action={requestButton(plan, plan.change)}
                  />
                ))}
              </div>
            </section>
          )}
          <p className="text-sm text-muted-foreground">
            {billing.canRequestChange
              ? 'Plan changes are reviewed by the MyanLex team before they apply.'
              : 'Ask a workspace Owner to change the plan.'}{' '}
            {contact &&
              (/^[^@\s]+@[^@\s]+$/.test(contact) ? (
                <>
                  Questions?{' '}
                  <a
                    className="font-medium underline"
                    href={`mailto:${contact}`}
                  >
                    Contact {contact}
                  </a>
                  .
                </>
              ) : (
                <>Questions? Contact {contact}.</>
              ))}
          </p>
        </>
      )}
    </div>
  );
}
