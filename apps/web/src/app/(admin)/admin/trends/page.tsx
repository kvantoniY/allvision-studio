'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Edit, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  type AdminTrend,
  useDeleteAdminTrendMutation,
  useListAdminTrendsQuery,
  useReorderAdminTrendMutation,
  useUpdateAdminTrendMutation,
} from '@/store/api/admin-trends-api';

type StatusFilter = 'all' | 'active' | 'hidden';

function short(value: string, length = 60) {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function trendPrice(trend: AdminTrend) {
  return trend.priceTokens ?? trend.service.priceTokens;
}

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'TREND_IN_USE') return 'Невозможно удалить: есть активные проекты с этим трендом';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function AdminTrendsPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminTrend | null>(null);
  const { data, isLoading } = useListAdminTrendsQuery({
    page: 1,
    limit: 200,
    serviceSlug: 'trends',
    isActive: status === 'all' ? undefined : status === 'active',
  });
  const [updateTrend] = useUpdateAdminTrendMutation();
  const [deleteTrend, deleteState] = useDeleteAdminTrendMutation();
  const [reorderTrend] = useReorderAdminTrendMutation();

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const source = data?.items ?? [];
    if (!needle) return source;
    return source.filter((trend) => trend.title.toLowerCase().includes(needle));
  }, [data?.items, search]);

  const toggleActive = async (trend: AdminTrend) => {
    const body = new FormData();
    body.append('isActive', String(!trend.isActive));
    try {
      await updateTrend({ id: trend.id, body }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const reorder = async (trend: AdminTrend, direction: 'up' | 'down') => {
    try {
      await reorderTrend({ id: trend.id, direction }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTrend(deleteTarget.id).unwrap();
      setDeleteTarget(null);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Тренды</h1>
          <p className="mt-2 text-sm text-slate-400">Админский каталог трендов для услуги trends.</p>
        </div>
        <Button asChild className="bg-violet-600 hover:bg-violet-500">
          <Link href="/admin/trends/new">
            <Plus className="h-4 w-4" />
            Создать тренд
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="hidden">Скрытые</option>
        </select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по названию"
          className="max-w-sm"
        />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Обложка</th>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Промпт</th>
              <th className="px-4 py-3">Цена</th>
              <th className="px-4 py-3">Использований</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Порядок</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <div className="font-medium text-white">Создайте первый тренд</div>
                  <Button asChild className="mt-4 bg-violet-600 hover:bg-violet-500">
                    <Link href="/admin/trends/new">Создать тренд</Link>
                  </Button>
                </td>
              </tr>
            )}
            {items.map((trend) => (
              <tr key={trend.id} className="align-middle">
                <td className="px-4 py-3">
                  {trend.referenceImg ? (
                    <img src={trend.referenceImg} alt="" className="h-10 w-10 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded bg-zinc-800" />
                  )}
                </td>
                <td className="max-w-[220px] px-4 py-3 font-medium text-white">
                  <div className="truncate">{trend.title}</div>
                </td>
                <td className="max-w-[280px] px-4 py-3 text-slate-300">{short(trend.prompt)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{trendPrice(trend)}</div>
                  {trend.priceTokens === null && <div className="text-xs text-slate-500">по услуге</div>}
                </td>
                <td className="px-4 py-3">{trend.usedCount}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleActive(trend)}>
                    <Badge className={trend.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>
                      {trend.isActive ? 'Активен' : 'Скрыт'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3">{trend.sortOrder}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => reorder(trend, 'up')} aria-label="Вверх">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => reorder(trend, 'down')} aria-label="Вниз">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="outline" size="icon" aria-label="Редактировать">
                      <Link href={`/admin/trends/${trend.id}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button type="button" variant="destructive" size="icon" onClick={() => setDeleteTarget(trend)} aria-label="Удалить">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Удалить тренд?"
        description="Тренд будет удалён без восстановления. Активные проекты заблокируют удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
