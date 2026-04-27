import { AdminTrendForm } from '@/components/admin/AdminTrendForm';

export default function NewAdminTrendPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Создать тренд</h1>
        <p className="mt-2 text-sm text-slate-400">Загрузите preview video и thumbnail, затем заполните AI-настройки.</p>
      </div>
      <AdminTrendForm mode="create" />
    </div>
  );
}
