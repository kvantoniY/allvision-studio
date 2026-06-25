import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AdminServiceForm } from '@/components/admin/services/AdminServiceForm';

export default function NewAdminServicePage() {
  return (
    <div className="animate-admin-in">
      <nav className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Link href="/admin/services" className="transition-colors hover:text-violet-300">
          Услуги
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-slate-300">Новая услуга</span>
      </nav>
      <div className="mb-7">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Создать услугу</h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Соберите pipeline из блоков, настройте форму для юзера, цены и превью.
        </p>
      </div>
      <AdminServiceForm mode="create" />
    </div>
  );
}
