'use client';

import Link from 'next/link';
import { AdminServiceForm } from '@/components/admin/services/AdminServiceForm';
import { Button } from '@/components/ui/button';
import { useGetAdminServiceQuery } from '@/store/api/admin-services-api';

export default function EditAdminServicePage({ params }: { params: { id: string } }) {
  const { data, isLoading, isError } = useGetAdminServiceQuery(params.id);

  if (isLoading) {
    return <div className="text-slate-400">Загрузка услуги...</div>;
  }

  if (isError || !data?.service) {
    return (
      <div>
        <h1 className="text-3xl font-bold">Услуга не найдена</h1>
        <Button asChild className="mt-4" variant="outline">
          <Link href="/admin/services">Вернуться к списку</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">{data.service.title}</h1>
        <p className="mt-2 text-sm text-slate-400">{data.service.slug}</p>
      </div>
      <AdminServiceForm mode="edit" service={data.service} />
    </div>
  );
}
