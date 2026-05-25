'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  type AdminPaymentStatus,
  useListAdminPaymentsQuery,
} from '@/store/api/admin-payments-api';

type StatusFilter = 'all' | AdminPaymentStatus;

const STATUS_LABEL: Record<AdminPaymentStatus, string> = {
  PENDING: 'Ожидает',
  SUCCEEDED: 'Оплачен',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменён',
};

const STATUS_COLOR: Record<AdminPaymentStatus, string> = {
  PENDING: 'bg-yellow-600',
  SUCCEEDED: 'bg-emerald-600',
  FAILED: 'bg-red-600',
  CANCELLED: 'bg-zinc-600',
};

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');

  const payments = useListAdminPaymentsQuery({
    page,
    limit: 50,
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  });

  const totalPages = Math.max(1, Math.ceil((payments.data?.total ?? 0) / (payments.data?.limit ?? 50)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Платежи</h1>
        <p className="mt-2 text-sm text-slate-400">
          Все рублёвые платежи, статусы Робокассы, ручная проверка и подтверждение проблемных платежей.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-3">
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as StatusFilter);
          }}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все статусы</option>
          <option value="PENDING">Ожидает</option>
          <option value="SUCCEEDED">Оплачен</option>
          <option value="FAILED">Ошибка</option>
          <option value="CANCELLED">Отменён</option>
        </select>
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Поиск по ID платежа, InvId или email"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Дата</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Назначение</th>
              <th className="px-4 py-3">InvId</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Зачислено</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-900/60">
            {payments.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            )}
            {(payments.data?.items ?? []).map((payment) => (
              <tr key={payment.id} className="hover:bg-zinc-900">
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                  <Link href={`/admin/payments/${payment.id}`} className="text-rose-200 hover:underline">
                    {new Date(payment.createdAt).toLocaleString('ru-RU')}
                  </Link>
                </td>
                <td className="px-4 py-3 font-medium text-white">
                  <Link href={`/admin/users/${payment.user.id}`} className="hover:text-rose-200">
                    {payment.user.email}
                  </Link>
                </td>
                <td className="px-4 py-3 font-semibold text-amber-300 whitespace-nowrap">
                  {(payment.amountRub / 100).toLocaleString('ru-RU')} ₽
                </td>
                <td className="px-4 py-3">{payment.purpose === 'TOPUP' ? 'Пополнение' : 'Заказ'}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">
                  {payment.providerPaymentId ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_COLOR[payment.status]}>{STATUS_LABEL[payment.status]}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-400">{payment.tokensAdded ?? '—'}</td>
              </tr>
            ))}
            {!payments.isLoading && (payments.data?.items.length ?? 0) === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Платежи не найдены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">
          Страница {page} из {totalPages}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
            Назад
          </Button>
          <Button type="button" variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
            Вперёд
          </Button>
        </div>
      </div>
    </div>
  );
}
