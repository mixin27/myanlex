import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireSession } from '@/lib/auth-server';

const navigation = [
  ['Dashboard', '/dashboard'],
  ['Projects', '/projects'],
  ['API keys', '/api-keys'],
  ['Usage', '/usage'],
  ['Documentation', '/documentation'],
  ['Account', '/account'],
] as const;

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSession();
  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          MyanLex
        </Link>
        <nav aria-label="Developer portal">
          {navigation.map(([label, href]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="portal-content">{children}</main>
    </div>
  );
}
