'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AdminTrendForm } from '@/components/admin/AdminTrendForm';
import { useGetAdminTrendQuery } from '@/store/api/admin-trends-api';

type EditAdminTrendPageProps = {
  params: { id: string };
};

export default function EditAdminTrendPage({ params }: EditAdminTrendPageProps) {
  const { data, isLoading, isError } = useGetAdminTrendQuery(params.id);

  if (isLoading) {
    return <div className="rounded-lg border border-zinc-800 p-8 text-slate-400">Загрузка...</div>;
  }

  if (isError || !data?.trend) {
    return (
      <div className="rounded-lg border border-zinc-800 p-8">
        <h1 className="text-2xl font-bold">Тренд не найден</h1>
        <Button asChild className="mt-5">
          <Link href="/admin/trends">Вернуться к списку</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Редактировать тренд</h1>
        <p className="mt-2 text-sm text-slate-400">{data.trend.title}</p>
      </div>
      <AdminTrendForm mode="edit" trend={data.trend} />
    </div>
  );
}
