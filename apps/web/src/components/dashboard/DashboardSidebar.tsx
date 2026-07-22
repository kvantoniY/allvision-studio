'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Sparkles } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { ADMIN_SIDEBAR_SECTIONS, METHODIST_SIDEBAR_SECTIONS, SIDEBAR_SECTIONS, TEACHER_SIDEBAR_SECTIONS, isActive } from './sidebar-nav';

function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

export function DashboardSidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  if (!user) return null;

  const baseSections = user.role === 'TEACHER'
    ? TEACHER_SIDEBAR_SECTIONS
    : user.role === 'METHODIST'
      ? METHODIST_SIDEBAR_SECTIONS
      : user.role === 'ADMIN'
        ? ADMIN_SIDEBAR_SECTIONS
      : SIDEBAR_SECTIONS;
  const sidebarSections = baseSections;

  return (
    <div className="academy-theme flex h-full min-h-0 flex-col gap-6 bg-card p-4 text-foreground">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-2 py-1 font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <span>Allvision Academy</span>
      </Link>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {sidebarSections.map((section, sectionIndex) => (
          <div key={section.label ?? sectionIndex} className={cn(sectionIndex > 0 && 'mt-3 border-t border-border pt-3')}>
            {section.label && (
              <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </div>
            )}
            <div className="grid gap-1">
              {section.items.map((item) => {
                const active = isActive(item.href, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-border pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-secondary p-3">
          <Link href="/profile" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar className="h-10 w-10">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
              <AvatarFallback>{initialsOf(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{user.name ?? user.email}</div>
              <div className="truncate text-xs text-muted-foreground">{user.email}</div>
            </div>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => {
              onNavigate?.();
              void logout();
            }}
            aria-label="Выйти"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DashboardSidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-card md:block">
      <DashboardSidebarContent />
    </aside>
  );
}
