'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';

const authRoutes = ['/login', '/register', '/forgot-password', '/reset-password'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = authRoutes.some((route) => pathname === route);

  return (
    <>
      {!isAuthRoute && <Header />}
      <main className="flex-1">{children}</main>
      {!isAuthRoute && <Footer />}
    </>
  );
}
