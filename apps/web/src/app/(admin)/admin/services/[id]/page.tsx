'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AdminServiceForm } from '@/components/admin/services/AdminServiceForm';
import { Button } from '@/components/ui/button';
import { useGetAdminServiceQuery } from '@/store/api/admin-services-api';

export default function EditAdminServicePage({ params }: { params: { id: string } }) {
  const { data, isLoading, isError } = useGetAdminServiceQuery(params.id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-4 w-40 animate-pulse rounded bg-zinc-800/80" />
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-800/80" />
        <div className="h-64 w-full animate-pulse rounded-xl bg-zinc-900/60" />
      </div>
    );
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
    <div className="animate-admin-in">
      <nav className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Link href="/admin/services" className="transition-colors hover:text-violet-300">
          Услуги
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="max-w-[60vw] truncate text-slate-300">{data.service.title}</span>
      </nav>
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight text-white sm:text-3xl">{data.service.title}</h1>
          <p className="mt-1.5 font-mono text-xs text-slate-500">{data.service.slug}</p>
        </div>
        <span
          className={
            'ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ' +
            (data.service.isActive
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30'
              : 'bg-zinc-800 text-slate-400 ring-1 ring-inset ring-zinc-700')
          }
        >
          <span className={'h-1.5 w-1.5 rounded-full ' + (data.service.isActive ? 'bg-emerald-400' : 'bg-slate-500')} />
          {data.service.isActive ? 'Активна' : 'Скрыта'}
        </span>
      </div>
      <AdminServiceForm mode="edit" service={data.service} />
    </div>
  );
}
