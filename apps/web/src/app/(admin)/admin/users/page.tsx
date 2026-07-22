'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { type AdminUser, useListAdminUsersQuery } from '@/store/api/admin-users-api';

type RoleFilter = 'all' | AdminUser['role'];
type StatusFilter = 'all' | 'active' | 'deleted';

function roleLabel(role: AdminUser['role']) {
  if (role === 'ADMIN') return 'Админ';
  if (role === 'READONLY_ADMIN') return 'Readonly-админ';
  if (role === 'TEACHER') return 'Преподаватель';
  if (role === 'METHODIST') return 'Методист';
  if (role === 'PARENT') return 'Родитель';
  return 'Пользователь';
}

function statusLabel(user: AdminUser) {
  return user.deletedAt ? 'Удалён' : 'Активен';
}

export default function AdminUsersPage() {
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<RoleFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const settings = useGetAdminSettingsQuery();
  const rate = settings.data?.settings.usdToRub ?? 80;
  const users = useListAdminUsersQuery({
    page,
    limit: 50,
    role: role === 'all' ? undefined : role,
    status: status === 'all' ? undefined : status,
    search: search.trim() || undefined,
  });
  const totalPages = Math.max(1, Math.ceil((users.data?.total ?? 0) / (users.data?.limit ?? 50)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Пользователи</h1>
        <p className="mt-2 text-sm text-slate-400">Аккаунты, роли, балансы токенов и последняя активность.</p>
      </div>

      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 md:grid-cols-4">
        <select value={role} onChange={(event) => { setPage(1); setRole(event.target.value as RoleFilter); }} className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100">
          <option value="all">Все роли</option>
          <option value="PARENT">Родители</option>
          <option value="TEACHER">Преподаватели</option>
          <option value="METHODIST">Методисты</option>
          <option value="USER">Пользователи (legacy)</option>
          <option value="ADMIN">Админы</option>
          <option value="READONLY_ADMIN">Readonly-админы</option>
        </select>
        <select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as StatusFilter); }} className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100">
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="deleted">Удалённые</option>
        </select>
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Поиск по почте" className="pl-9" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase text-slate-400">
            <tr>
              <th className="px-4 py-3">Почта</th>
              <th className="px-4 py-3">Дата регистрации</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Баланс</th>
              <th className="px-4 py-3">Проектов</th>
              <th className="px-4 py-3">Последняя активность</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-900/60">
            {users.isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Загрузка...</td></tr>}
            {(users.data?.items ?? []).map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-3 font-medium text-white"><Link href={`/admin/users/${user.id}`} className="hover:text-violet-200">{user.email}</Link></td>
                <td className="px-4 py-3">{new Date(user.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">{roleLabel(user.role)}</td>
                <td className="px-4 py-3">{formatMoney({ coins: user.tokenBalance }, { primary: 'coins', showAll: true, usdToRub: rate })}</td>
                <td className="px-4 py-3">{user._count.projects}</td>
                <td className="px-4 py-3">{new Date(user.lastActivityAt).toLocaleString()}</td>
                <td className="px-4 py-3"><Badge className={user.deletedAt ? 'bg-zinc-700' : 'bg-emerald-600'}>{statusLabel(user)}</Badge></td>
                <td className="px-4 py-3 text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/users/${user.id}`}>Управление</Link>
                  </Button>
                </td>
              </tr>
            ))}
            {!users.isLoading && (users.data?.items.length ?? 0) === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Пользователи не найдены</td></tr>}
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
