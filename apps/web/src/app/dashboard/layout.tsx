import { AuthGuard } from '@/components/auth/auth-guard';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-[calc(100vh-64px)]">
        <DashboardSidebar />
        <main className="flex-1 min-w-0 bg-slate-950">
          <div className="container py-8">{children}</div>
        </main>
      </div>
    </AuthGuard>
  );
}
