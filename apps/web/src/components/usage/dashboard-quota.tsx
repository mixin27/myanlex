import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PlatformReadError, readPlatform } from '@/lib/platform-server';
import type {
  Organization,
  OrganizationAccess,
  QuotaReport,
} from '@/lib/platform-types';
import { QuotaSummary } from './quota-summary';

export async function DashboardQuota({
  organizationId,
  organizations,
}: {
  organizationId: string | undefined;
  organizations: Organization[];
}) {
  if (!organizationId)
    return (
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Monthly allowance</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a workspace to view its plan and monthly allowance.
        </p>
      </section>
    );
  if (!z.uuid().safeParse(organizationId).success) notFound();
  const organization = await readPlatform<OrganizationAccess>(
    `organizations/${organizationId}`,
  );
  const choices = organizations.some((item) => item.id === organization.id)
    ? organizations
    : [organization, ...organizations];
  let content;
  if (!organization.permissions.includes('usage.read')) {
    content = (
      <p className="text-sm text-muted-foreground">
        Your role needs usage.read to view this workspace’s monthly allowance.
      </p>
    );
  } else {
    let report: QuotaReport | undefined;
    try {
      report = await readPlatform<QuotaReport>(
        `organizations/${organization.id}/quota`,
      );
    } catch (error) {
      if (!(error instanceof PlatformReadError)) throw error;
    }
    content = report ? (
      <QuotaSummary report={report} />
    ) : (
      <p role="status" className="text-sm text-muted-foreground">
        Monthly allowance is temporarily unavailable. Reload to try again; no
        allowance estimate is shown.
      </p>
    );
  }
  return (
    <section className="space-y-5 rounded-xl border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Monthly allowance</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {organization.name} · Workspace-wide
          </p>
        </div>
        <form action="/dashboard" className="flex flex-wrap items-center gap-2">
          <label htmlFor="quota-workspace" className="sr-only">
            Workspace
          </label>
          <select
            id="quota-workspace"
            name="organization"
            defaultValue={organization.id}
            className="max-w-60 rounded-md border bg-background px-3 py-2 text-sm"
          >
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border px-3 py-2 text-sm font-medium"
          >
            View
          </button>
        </form>
      </div>
      {content}
    </section>
  );
}
