'use client';

import { useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { type AdminProject, useListAdminProjectsQuery } from '@/store/api/admin-projects-api';

type StatusFilter = 'all' | AdminProject['status'];

function statusLabel(status: AdminProject['status']) {
  if (status === 'PENDING') return 'Ожидает';
  if (status === 'PROCESSING') return 'В работе';
  if (status === 'COMPLETED') return 'Готов';
  return 'Ошибка';
}

function statusClass(status: AdminProject['status']) {
  if (status === 'COMPLETED') return 'bg-emerald-600';
  if (status === 'FAILED') return 'bg-red-700';
  if (status === 'PROCESSING') return 'bg-amber-600';
  return 'bg-zinc-700';
}

export default function AdminProjectsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [serviceSlug, setServiceSlug] = useState('');
  const [user, setUser] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const settings = useGetAdminSettingsQuery();
  const rate = settings.data?.settings.usdToRub ?? 80;
  const projects = useListAdminProjectsQuery({
    page,
    limit: 50,
    status: status === 'all' ? undefined : status,
    serviceSlug: serviceSlug || undefined,
    user: user.trim() || undefined,
    dateFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    dateTo: dateTo ? new Date(dateTo).toISOString() : undefined,
  });
  const totalPages = Math.max(1, Math.ceil((projects.data?.total ?? 0) / (projects.data?.limit ?? 50)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Проекты</h1>
        <p className="mt-2 text-sm text-slate-400">Все генерации пользователей, себестоимость, цена и ошибки выполнения.</p>
      </div>

      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-5">
        <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as StatusFilter); }} className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100">
          <option value="all">Все статусы</option>
          <option value="PENDING">Ожидают</option>
          <option value="PROCESSING">В работе</option>
          <option value="COMPLETED">Готовые</option>
          <option value="FAILED">С ошибкой</option>
        </select>
        <select value={serviceSlug} onChange={(event) => { setPage(1); setServiceSlug(event.target.value); }} className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100">
          <option value="">Все услуги</option>
          {(projects.data?.services ?? []).map((service) => <option key={service.id} value={service.slug}>{service.title}</option>)}
        </select>
        <Input value={user} onChange={(event) => { setPage(1); setUser(event.target.value); }} placeholder="Почта или ID пользователя" />
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Дата от</Label>
          <Input type="date" value={dateFrom} onChange={(event) => { setPage(1); setDateFrom(event.target.value); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-slate-500">Дата до</Label>
          <Input type="date" value={dateTo} onChange={(event) => { setPage(1); setDateTo(event.target.value); }} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Услуга</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Прогресс</th>
              <th className="px-4 py-3">Наша себестоимость</th>
              <th className="px-4 py-3">Цена для юзера</th>
              <th className="px-4 py-3">Ошибка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-900/60">
            {projects.isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Загрузка...</td></tr>}
            {(projects.data?.items ?? []).map((project) => (
              <tr key={project.id} className="hover:bg-zinc-900">
                <td className="px-4 py-3"><Link href={`/admin/projects/${project.id}`} className="text-white hover:text-rose-200">{new Date(project.createdAt).toLocaleString()}</Link></td>
                <td className="px-4 py-3">{project.user.email}</td>
                <td className="px-4 py-3">{project.service?.title ?? 'Без услуги'}</td>
                <td className="px-4 py-3"><Badge className={statusClass(project.status)}>{statusLabel(project.status)}</Badge></td>
                <td className="px-4 py-3">{project.progress}%</td>
                <td className="px-4 py-3">{formatMoney({ usd: project.costUsd }, { primary: 'usd', showAll: true, usdToRub: rate })}</td>
                <td className="px-4 py-3">{formatMoney({ coins: project.userPriceCoins }, { primary: 'coins', showAll: true, usdToRub: rate })}</td>
                <td className="px-4 py-3 text-rose-200">{project.errorCode ?? '—'}</td>
              </tr>
            ))}
            {!projects.isLoading && (projects.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Проекты не найдены</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">Страница {page} из {totalPages}</div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Назад</Button>
          <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Вперёд</Button>
        </div>
      </div>
    </div>
  );
}
