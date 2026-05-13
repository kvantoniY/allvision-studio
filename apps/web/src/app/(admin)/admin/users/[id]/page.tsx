'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { useGetAdminUserQuery, useUpdateAdminUserMutation } from '@/store/api/admin-users-api';

function roleLabel(role: string) {
  if (role === 'ADMIN') return 'Админ';
  if (role === 'READONLY_ADMIN') return 'Readonly-админ';
  return 'Пользователь';
}

function projectStatusLabel(status: string) {
  if (status === 'PENDING') return 'Ожидает';
  if (status === 'PROCESSING') return 'В работе';
  if (status === 'COMPLETED') return 'Готов';
  if (status === 'FAILED') return 'Ошибка';
  return status;
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useGetAdminUserQuery(params.id);
  const settings = useGetAdminSettingsQuery();
  const [updateUser, updateState] = useUpdateAdminUserMutation();
  const [balance, setBalance] = useState('');
  const rate = settings.data?.settings.usdToRub ?? 80;

  useEffect(() => {
    if (user.data?.user) setBalance(String(user.data.user.tokenBalance));
  }, [user.data?.user]);

  const saveBalance = async () => {
    try {
      await updateUser({ id: params.id, tokenBalance: Number(balance) }).unwrap();
      toast({ title: 'Баланс обновлён' });
    } catch {
      toast({ title: 'Не удалось обновить баланс', variant: 'destructive' });
    }
  };

  if (user.isLoading) return <div className="text-slate-400">Загрузка...</div>;
  if (!user.data?.user) return <div className="text-slate-400">Пользователь не найден</div>;
  const item = user.data.user;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button type="button" variant="ghost" onClick={() => router.push('/admin/users')}>Назад к пользователям</Button>
          <h1 className="mt-3 text-3xl font-bold text-white">{item.email}</h1>
          <p className="mt-2 text-sm text-slate-400">Роль: {roleLabel(item.role)} · проектов: {item._count.projects}</p>
        </div>
        <Badge className={item.deletedAt ? 'bg-zinc-700' : 'bg-emerald-600'}>{item.deletedAt ? 'Удалён' : 'Активен'}</Badge>
      </div>

      <section className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5 md:grid-cols-3">
        <div>
          <div className="text-xs uppercase text-slate-500">Дата регистрации</div>
          <div className="mt-2 text-white">{new Date(item.createdAt).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-500">Последняя активность</div>
          <div className="mt-2 text-white">{new Date(item.lastActivityAt).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-500">Баланс</div>
          <div className="mt-2 text-white">{formatMoney({ coins: item.tokenBalance }, { primary: 'coins', showAll: true, usdToRub: rate })}</div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Изменить баланс</h2>
        <div className="mt-4 flex max-w-md items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="tokenBalance">Новый баланс, коины</Label>
            <Input id="tokenBalance" type="number" min={0} value={balance} onChange={(event) => setBalance(event.target.value)} />
          </div>
          <Button type="button" disabled={updateState.isLoading} onClick={saveBalance} className="bg-rose-500 hover:bg-rose-400">Сохранить</Button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Последние проекты</h2>
        <div className="mt-4 space-y-2">
          {(item.projects ?? []).map((project) => (
            <Link key={project.id} href={`/admin/projects/${project.id}`} className="block rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-rose-400">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium text-white">{project.title}</span>
                <Badge className={project.status === 'FAILED' ? 'bg-red-700' : 'bg-zinc-700'}>{projectStatusLabel(project.status)}</Badge>
              </div>
              <div className="mt-1 text-xs text-slate-500">{project.service?.title ?? 'Без услуги'} · {new Date(project.createdAt).toLocaleString()}</div>
            </Link>
          ))}
          {(item.projects?.length ?? 0) === 0 && <div className="text-sm text-slate-500">Проектов пока нет</div>}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">История баланса</h2>
        <div className="mt-4 space-y-2">
          {(item.tokenTxns ?? []).map((txn) => (
            <div key={txn.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
              <div className="font-medium text-white">{txn.amount > 0 ? '+' : ''}{txn.amount} коинов · баланс {txn.balanceAfter}</div>
              <div className="mt-1 text-xs text-slate-500">{txn.reason} · {new Date(txn.createdAt).toLocaleString()}</div>
            </div>
          ))}
          {(item.tokenTxns?.length ?? 0) === 0 && <div className="text-sm text-slate-500">Операций пока нет</div>}
        </div>
      </section>
    </div>
  );
}
