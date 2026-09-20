import { Suspense, type ReactNode } from 'react';
import { requireSession } from '@/lib/auth-server';
import { DashboardShell } from '@/components/dashboard-shell';
import { cookies } from 'next/headers';

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = await requireSession();
  const sidebarOpen = (await cookies()).get('sidebar_state')?.value !== 'false';
  return (
    <Suspense>
      <DashboardShell
        user={{ name: user.name, email: user.email }}
        defaultOpen={sidebarOpen}
      >
        {children}
      </DashboardShell>
    </Suspense>
  );
}
