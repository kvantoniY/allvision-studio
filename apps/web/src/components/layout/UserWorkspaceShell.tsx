'use client';

import Link from 'next/link';
import { LogOut } from 'lucide-react';

import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardSidebarMobile } from '@/components/dashboard/DashboardSidebarMobile';
import { ProjectEventsBridge } from '@/components/realtime/ProjectEventsBridge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';

function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export function UserWorkspaceShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="academy-theme min-h-screen bg-background text-foreground">
      {/* Realtime-обновление статусов генераций на любом экране (SSE); поллинг — фолбэк. */}
      <ProjectEventsBridge enabled={Boolean(user)} />
      <DashboardSidebar />
      <div className="flex min-h-screen min-w-0 flex-col md:pl-64">
        {user && (
          <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-3 backdrop-blur md:hidden">
            <DashboardSidebarMobile />
            <div className="flex items-center gap-2">
              <Link href="/profile" className="rounded-full">
                <Avatar className="h-8 w-8">
                  {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
                  <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
                </Avatar>
              </Link>
              <button
                type="button"
                onClick={() => { void logout(); }}
                aria-label="Выйти"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-destructive hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
