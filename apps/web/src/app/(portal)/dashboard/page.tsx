import Link from 'next/link';
import { readPlatform } from '@/lib/platform-server';
import type { Organization, Page } from '@/lib/platform-types';

export default async function DashboardPage() {
  const organizations = await readPlatform<Page<Organization>>(
    'organizations?limit=1',
  );
  const hasOrganization = organizations.items.length > 0;
  return (
    <>
      <header className="page-heading">
        <h1>Dashboard</h1>
        <p>Your MyanLex developer workspace at a glance.</p>
      </header>
      <section className="panel">
        <h2>
          {hasOrganization ? 'Manage your projects' : 'Set up your workspace'}
        </h2>
        <p>
          {hasOrganization
            ? 'Choose an organization to create and manage its projects.'
            : 'Create an organization, then add your first development or production project.'}
        </p>
        <Link className="underline" href="/projects">
          {hasOrganization ? 'Open projects' : 'Create your first organization'}
        </Link>
      </section>
      <section className="panel">
        <h2>API usage</h2>
        <p className="muted">
          API-key management and usage reporting are not yet available.
        </p>
      </section>
    </>
  );
}
