import { AdminServiceForm } from '@/components/admin/services/AdminServiceForm';

export default function NewAdminServicePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Создать услугу</h1>
        <p className="mt-2 text-sm text-slate-400">
          Соберите pipeline из блоков, настройте форму для юзера, цены и превью.
        </p>
      </div>
      <AdminServiceForm mode="create" />
    </div>
  );
}
