import Link from 'next/link';
import { Suspense } from 'react';
import { DashboardUsage } from '@/components/usage/dashboard-usage';
import { DashboardQuota } from '@/components/usage/dashboard-quota';
import type { UsageSelection } from '@/lib/usage-server';
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  FolderKanban,
  KeyRound,
  Terminal,
} from 'lucide-react';
import { readPlatform } from '@/lib/platform-server';
import type { Organization, Page } from '@/lib/platform-types';
import { CreateResource } from '@/components/workspace/create-resource';
import { buttonVariants } from '@/components/ui/button';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<UsageSelection>;
}) {
  const selection = await searchParams;
  const organizations = await readPlatform<Page<Organization>>(
    'organizations?limit=6',
  );
  return (
    <div className="space-y-8">
      <header className="page-heading flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest">
            Developer workspace
          </p>
          <h1>Build with Myanmar language.</h1>
          <p>
            Manage your projects, connect your applications, and start building.
          </p>
        </div>
        <CreateResource />
      </header>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Loading monthly allowance…
          </p>
        }
      >
        <DashboardQuota
          organizationId={selection.organization ?? organizations.items[0]?.id}
          organizations={organizations.items}
        />
      </Suspense>
      <Suspense
        fallback={
          <p className="text-sm text-muted-foreground">
            Loading project activity…
          </p>
        }
      >
        <DashboardUsage selection={selection} />
      </Suspense>
      <section className="relative overflow-hidden rounded-xl bg-[#132e27] p-6 text-white md:p-8">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3 py-1 text-xs text-emerald-100">
              <Terminal className="size-3" /> Your next integration starts here
            </span>
            <h2 className="mt-5 text-2xl font-medium tracking-tight">
              Language tools.
              <br />
              One predictable API.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-emerald-100/70">
              Normalize, segment, and process Myanmar text with deterministic
              behavior and explicit contracts.
            </p>
            <Link
              href="/documentation"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium"
            >
              Explore the API <ArrowUpRight className="size-4" />
            </Link>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 p-5 font-mono text-xs leading-7">
            <p className="mb-3 text-emerald-200/50">
              # Your integration checklist
            </p>
            <p>
              <span className="mr-3 text-emerald-300">01</span>Create a
              workspace
            </p>
            <p>
              <span className="mr-3 text-emerald-300">02</span>Add a project for
              your app
            </p>
            <p>
              <span className="mr-3 text-emerald-300">03</span>Issue a scoped
              API key
            </p>
            <p>
              <span className="mr-3 text-emerald-300">04</span>Make your first
              request
            </p>
          </div>
        </div>
      </section>
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Your workspaces</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your teams and projects, in one place.
            </p>
          </div>
          <Link href="/projects" className="text-sm font-medium">
            View all →
          </Link>
        </div>
        {organizations.items.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {organizations.items.map((org) => (
              <Link
                key={org.id}
                href={`/projects?organization=${org.id}`}
                className="group rounded-xl border bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-emerald-50 p-2.5 text-emerald-800">
                    <Building2 className="size-5" />
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" />
                </div>
                <h3 className="mt-5 truncate font-semibold">{org.name}</h3>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {org.slug}
                </p>
                <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
                  Open workspace
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-white p-10 text-center">
            <Building2 className="mx-auto mb-4 size-7 text-muted-foreground" />
            <h3 className="font-medium">Make room for your first project</h3>
            <p className="my-3 text-sm text-muted-foreground">
              Create a workspace to organize projects and access.
            </p>
            <Link href="/projects" className={buttonVariants()}>
              Set up workspace
            </Link>
          </div>
        )}
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: 'Projects',
            text: 'Separate applications and environments.',
            href: '/projects',
            icon: FolderKanban,
          },
          {
            title: 'API keys',
            text: 'Issue scoped credentials for your services.',
            href: '/api-keys',
            icon: KeyRound,
          },
          {
            title: 'Documentation',
            text: 'Explore contracts and test in Scalar.',
            href: '/documentation',
            icon: BookOpen,
          },
        ].map(({ title, text, href, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex gap-4 rounded-xl border bg-white p-5 hover:border-emerald-300"
          >
            <Icon className="mt-0.5 size-5 shrink-0 text-emerald-800" />
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {text}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
