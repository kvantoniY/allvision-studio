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
  const isUserWorkspaceRoute = !!user && !isAuthRoute && !isMockPaymentRoute && !isAdminRoute;

  if (isUserWorkspaceRoute) {
    return <UserWorkspaceShell>{children}</UserWorkspaceShell>;
  }

  return (
    <>
      {!isAuthRoute && !isMockPaymentRoute && !isAdminRoute && <Header />}
      <main className="flex-1">{children}</main>
      {!isAuthRoute && !isMockPaymentRoute && !isAdminRoute && <Footer />}
    </>
  );
}
