'use client';

import { useState } from 'react';
import Link from 'next/link';
import { LifeBuoy, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type SupportTicket,
  type SupportTicketStatus,
} from '@/store/api/support-api';
import { useListAdminSupportTicketsQuery } from '@/store/api/admin-support-api';
import { cn } from '@/lib/utils';

type Filter = 'all' | SupportTicketStatus;

function statusLabel(status: SupportTicketStatus) {
  return status === 'RESOLVED' ? 'Выполнен' : 'Открыт';
}

function statusClass(status: SupportTicketStatus) {
  return status === 'RESOLVED' ? 'bg-emerald-600' : 'bg-amber-600';
}

function lastMessage(ticket: SupportTicket) {
  const message = ticket.messages[0];
  if (!message) return 'Нет сообщений';
  return message.body || `${message.attachments.length} файл(ов)`;
}

export default function AdminSupportPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const tickets = useListAdminSupportTicketsQuery(
    {
      page,
      limit: 50,
      status: status === 'all' ? undefined : status,
      search: search.trim() || undefined,
    },
    { pollingInterval: 15000 },
  );
  const totalPages = Math.max(1, Math.ceil((tickets.data?.total ?? 0) / (tickets.data?.limit ?? 50)));
  const items = tickets.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-rose-300">
            <LifeBuoy className="h-4 w-4" />
            Поддержка
          </div>
          <h1 className="mt-2 text-3xl font-bold text-white">Тикеты поддержки</h1>
          <p className="mt-2 text-sm text-slate-400">Обращения пользователей, переписка и вложения.</p>
        </div>
      </header>

      <div className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-[220px_1fr]">
        <select
          value={status}
          onChange={(event) => {
            setPage(1);
            setStatus(event.target.value as Filter);
          }}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все статусы</option>
          <option value="OPEN">Открытые</option>
          <option value="RESOLVED">Выполненные</option>
        </select>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
            placeholder="Поиск по теме, email или имени"
            className="pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Обновлён</th>
              <th className="px-4 py-3">Тема</th>
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Сообщений</th>
              <th className="px-4 py-3">Последнее</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-900/60">
            {tickets.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8">
                  <Skeleton className="h-12" />
                </td>
              </tr>
            )}
            {items.map((ticket) => (
              <tr key={ticket.id} className="hover:bg-zinc-900">
                <td className="whitespace-nowrap px-4 py-3 text-slate-300">{new Date(ticket.updatedAt).toLocaleString('ru-RU')}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/support/${ticket.id}`} className="font-medium text-white hover:text-rose-200">
                    {ticket.subject}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">#{ticket.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-100">{ticket.user.name ?? ticket.user.email}</div>
                  <div className="text-xs text-slate-500">{ticket.user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge className={cn(statusClass(ticket.status), 'text-white')}>{statusLabel(ticket.status)}</Badge>
                </td>
                <td className="px-4 py-3">{ticket._count?.messages ?? ticket.messages.length}</td>
                <td className="max-w-sm px-4 py-3">
                  <div className="line-clamp-2 text-slate-300">{lastMessage(ticket)}</div>
                </td>
              </tr>
            ))}
            {!tickets.isLoading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-500">Тикеты не найдены</td>
              </tr>
            )}
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
