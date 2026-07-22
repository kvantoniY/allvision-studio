import { requireAdminPage } from '@/lib/auth';

export default async function AdminPayoutsLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return children;
}
