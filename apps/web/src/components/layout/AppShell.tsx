'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { UserWorkspaceShell } from '@/components/layout/UserWorkspaceShell';
import { useAuth } from '@/hooks/use-auth';

const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAuthRoute = authRoutes.some((route) => pathname === route);
  const isMockPaymentRoute = pathname?.startsWith('/mock-payment') ?? false;
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;
  // Живой урок (A7) — самодостаточная полноэкранная комната, без сайдбара/хедера.
  const isLessonRoute = pathname?.startsWith('/lesson/') ?? false;
  const isUserWorkspaceRoute = !!user && !isAuthRoute && !isMockPaymentRoute && !isAdminRoute && !isLessonRoute;

  if (isLessonRoute) {
    return <main className="flex-1">{children}</main>;
  }

  if (isUserWorkspaceRoute) {
    return <UserWorkspaceShell>{children}</UserWorkspaceShell>;
  }

  // Гостевой Academy-лендинг на «/» — самодостаточный, без Studio-хедера/футера.
  if (!user && pathname === '/') {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <div className="academy-theme flex min-h-screen flex-col bg-background text-foreground">
      {!isAuthRoute && !isMockPaymentRoute && !isAdminRoute && <Header />}
      <main className="flex-1">{children}</main>
      {!isAuthRoute && !isMockPaymentRoute && !isAdminRoute && <Footer />}
    </div>
  );
}
