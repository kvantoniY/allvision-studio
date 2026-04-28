'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminScenarioTemplateForm } from '@/components/admin/AdminScenarioTemplateForm';
import { useGetAdminScenarioTemplateQuery } from '@/store/api/admin-scenario-templates-api';

type PageProps = {
  params: { id: string };
};

export default function EditScenarioTemplatePage({ params }: PageProps) {
  const { data, isLoading } = useGetAdminScenarioTemplateQuery(params.id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72 bg-zinc-900" />
        <Skeleton className="h-96 rounded-lg bg-zinc-900" />
      </div>
    );
  }

  if (!data?.template) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href="/admin/scenario-templates">Вернуться к списку</Link>
        </Button>
        <div className="rounded-lg border border-zinc-800 p-8 text-center text-slate-400">Шаблон не найден.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Редактировать шаблон</h1>
          <p className="mt-2 text-sm text-slate-400">{data.template.slug}</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/scenario-templates">Вернуться к списку</Link>
        </Button>
      </div>
      <AdminScenarioTemplateForm mode="edit" template={data.template} />
    </div>
  );
}
