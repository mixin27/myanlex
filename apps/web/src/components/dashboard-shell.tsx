'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  Settings2,
  Sparkles,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

const navigation = [
  { title: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Projects', href: '/projects', icon: FolderKanban },
  { title: 'API keys', href: '/api-keys', icon: KeyRound },
  { title: 'Usage', href: '/usage', icon: ChartNoAxesCombined },
];

function Navigation() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { setOpenMobile } = useSidebar();
  const context = new URLSearchParams();
  for (const key of ['organization', 'project']) {
    const value = params.get(key);
    if (value) context.set(key, value);
  }
  return (
    <SidebarContent>
      {[
        { label: 'Workspace', items: navigation },
        {
          label: 'Resources',
          items: [
            { title: 'Documentation', href: '/documentation', icon: BookOpen },
            { title: 'Account settings', href: '/account', icon: Settings2 },
          ],
        },
      ].map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel className="mb-2 text-[10px] uppercase tracking-widest">
            {group.label}
          </SidebarGroupLabel>
          <SidebarMenu className="gap-1">
            {group.items.map(({ title, href, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  className="h-10 data-active:bg-emerald-100 data-active:text-emerald-900"
                  tooltip={title}
                  isActive={pathname === href}
                  render={
                    <Link
                      href={`${href}${context.size ? `?${context}` : ''}`}
                      aria-current={pathname === href ? 'page' : undefined}
                    />
                  }
                  onClick={() => setOpenMobile(false)}
                >
                  <Icon className="size-4" />
                  <span>{title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </SidebarContent>
  );
}

export function DashboardShell({
  user,
  children,
  defaultOpen,
}: {
  user: { name: string; email: string };
  children: ReactNode;
  defaultOpen: boolean;
}) {
  const pathname = usePathname();
  const title =
    navigation.find((item) => item.href === pathname)?.title ??
    (pathname === '/account' ? 'Account settings' : 'Documentation');
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen={defaultOpen}>
        <Sidebar collapsible="icon" className="border-r border-border/70">
          <SidebarHeader className="h-20 justify-center px-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  render={<Link href="/dashboard" />}
                  tooltip="MyanLex overview"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-800 text-white">
                    <Sparkles className="size-4" />
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-base font-semibold tracking-tight">
                      MyanLex
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Developer console
                    </span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          <Navigation />
          <SidebarFooter className="border-t p-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Account settings"
                  render={<Link href="/account" />}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary font-semibold">
                    {user.name.charAt(0).toUpperCase() || 'M'}
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="min-w-0 bg-[#fafbf9]">
          <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b bg-white/95 px-4 backdrop-blur md:px-8">
            <SidebarTrigger />
            <span className="h-4 w-px bg-border" />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              Console
            </span>
            <ChevronRight className="hidden size-3 text-muted-foreground sm:inline" />
            <span className="text-sm font-medium">{title}</span>
            <Link
              href="/documentation"
              className="ml-auto flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <BookOpen className="size-4" />
              Developer docs
            </Link>
          </header>
          <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 lg:px-12 lg:py-10">
            {children}
          </div>
          <footer className="mt-auto flex flex-wrap justify-between gap-2 px-4 py-6 text-xs text-muted-foreground md:px-8 lg:px-12">
            <span>MyanLex · Myanmar language infrastructure</span>
            <span>Built for developers. Open source.</span>
          </footer>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
