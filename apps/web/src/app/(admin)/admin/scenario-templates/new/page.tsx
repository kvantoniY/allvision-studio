import { AdminScenarioTemplateForm } from '@/components/admin/AdminScenarioTemplateForm';

export default function NewScenarioTemplatePage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Создать шаблон сценария</h1>
        <p className="mt-2 text-sm text-slate-400">Загрузите preview video/image и заполните роли персонажей.</p>
      </div>
      <AdminScenarioTemplateForm mode="create" />
    </div>
  );
}
