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
import { useAuth } from '@/hooks/use-auth';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { type AdminUser, useGetAdminUserQuery, useUpdateAdminUserMutation } from '@/store/api/admin-users-api';

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

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось выполнить операцию';
}

const STAT_ACCENT: Record<string, string> = {
  violet: 'border-violet-500/30 bg-violet-500/5',
  amber: 'border-amber-500/30 bg-amber-500/5',
  emerald: 'border-emerald-500/30 bg-emerald-500/5',
  slate: 'border-zinc-800 bg-zinc-950',
};

function StatCard({ label, value, hint, accent = 'slate' }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${STAT_ACCENT[accent] ?? STAT_ACCENT.slate}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-xl font-bold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auth = useAuth();
  const user = useGetAdminUserQuery(params.id);
  const settings = useGetAdminSettingsQuery();
  const [updateUser, updateState] = useUpdateAdminUserMutation();
  const [balance, setBalance] = useState('');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [role, setRole] = useState<AdminUser['role']>('USER');
  const rate = settings.data?.settings.usdToRub ?? 80;

  useEffect(() => {
    if (user.data?.user) {
      setBalance(String(user.data.user.tokenBalance));
      setRole(user.data.user.role);
    }
  }, [user.data?.user]);

  const saveBalance = async () => {
    try {
      await updateUser({
        id: params.id,
        tokenBalance: Number(balance),
        reason: reason.trim() || 'admin_set_balance',
      }).unwrap();
      toast({ title: 'Баланс сохранён' });
      setReason('');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const applyDelta = async (sign: 1 | -1) => {
    const value = Number(delta);
    if (!Number.isFinite(value) || value <= 0) {
      toast({ title: 'Укажите положительное число токенов', variant: 'destructive' });
      return;
    }
    const signed = sign * Math.floor(value);
    try {
      await updateUser({
        id: params.id,
        tokenBalanceDelta: signed,
        reason: reason.trim() || (sign > 0 ? 'admin_grant' : 'admin_deduct'),
      }).unwrap();
      toast({ title: `${sign > 0 ? 'Начислено' : 'Списано'} ${Math.abs(signed)} токенов` });
      setDelta('');
      setReason('');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveRole = async () => {
    if (user.data?.user && role === user.data.user.role) {
      toast({ title: 'Роль не изменилась' });
      return;
    }
    if (
      !window.confirm(
        role === 'ADMIN'
          ? 'Выдать пользователю права администратора?'
          : role === 'READONLY_ADMIN'
            ? 'Выдать роль READONLY_ADMIN (только чтение админки)?'
            : 'Снять роль администратора?',
      )
    ) {
      return;
    }
    try {
      await updateUser({ id: params.id, role }).unwrap();
      toast({ title: `Роль обновлена: ${roleLabel(role)}` });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
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

      {item.stats && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Сводка по активности</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Генераций всего" value={String(item.stats.totalProjects)} hint={`Завершено ${item.stats.completedProjects} · ошибок ${item.stats.failedProjects}`} accent="violet" />
            <StatCard label="Потрачено на генерации" value={`${item.stats.spentCoins.toLocaleString('ru-RU')} коинов`} hint="по завершённым проектам" accent="amber" />
            <StatCard label="Пополнено" value={`${item.stats.topupRub.toLocaleString('ru-RU')} ₽`} hint={`${item.stats.topupCount} платежей · +${item.stats.topupCoins.toLocaleString('ru-RU')} коинов`} accent="emerald" />
            <StatCard label="Себестоимость PiAPI" value={`$${item.stats.providerCostUsd.toFixed(2)}`} hint="реальные расходы провайдера" accent="slate" />
          </div>
        </section>
      )}

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Управление балансом</h2>
        <p className="mt-1 text-xs text-slate-500">
          Все изменения записываются в историю токенов с указанной причиной. Текущий баланс: <b>{item.tokenBalance}</b>.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label htmlFor="reason">Причина (необязательно)</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Например: компенсация / тест / промо"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
            <Label htmlFor="delta" className="text-xs uppercase text-slate-400">
              Начислить / списать
            </Label>
            <div className="mt-2 flex items-end gap-2">
              <Input
                id="delta"
                type="number"
                min={1}
                value={delta}
                onChange={(event) => setDelta(event.target.value)}
                placeholder="100"
              />
              <Button
                type="button"
                disabled={updateState.isLoading || !delta}
                onClick={() => applyDelta(1)}
                className="bg-emerald-600 hover:bg-emerald-500"
              >
                + Начислить
              </Button>
              <Button
                type="button"
                disabled={updateState.isLoading || !delta}
                onClick={() => applyDelta(-1)}
                variant="outline"
                className="border-red-500/40 text-red-300"
              >
                − Списать
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
            <Label htmlFor="tokenBalance" className="text-xs uppercase text-slate-400">
              Установить точное значение
            </Label>
            <div className="mt-2 flex items-end gap-2">
              <Input
                id="tokenBalance"
                type="number"
                min={0}
                value={balance}
                onChange={(event) => setBalance(event.target.value)}
              />
              <Button
                type="button"
                disabled={updateState.isLoading}
                onClick={saveBalance}
                className="bg-rose-500 hover:bg-rose-400"
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Роль</h2>
        <p className="mt-1 text-xs text-slate-500">
          ADMIN — полный доступ к админке. READONLY_ADMIN — только просмотр. USER — обычный пользователь.
        </p>
        <div className="mt-4 flex max-w-md items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="role">Роль пользователя</Label>
            <select
              id="role"
              value={role}
              onChange={(event) => setRole(event.target.value as AdminUser['role'])}
              className="flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
            >
              <option value="USER">Пользователь</option>
              <option value="ADMIN">Админ</option>
              <option value="READONLY_ADMIN">Readonly-админ</option>
            </select>
          </div>
          <Button
            type="button"
            disabled={updateState.isLoading || role === item.role || (item.id === auth.user?.id && item.role === 'ADMIN' && role !== 'ADMIN')}
            onClick={saveRole}
            className="bg-rose-500 hover:bg-rose-400"
          >
            Сохранить роль
          </Button>
        </div>
        {item.id === auth.user?.id && item.role === 'ADMIN' ? (
          <p className="mt-2 text-xs text-yellow-300">Нельзя снять роль ADMIN с собственного аккаунта.</p>
        ) : null}
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
              <div className="font-medium text-white">{txn.amount > 0 ? '+' : ''}{txn.amount} токенов · баланс {txn.balanceAfter}</div>
              <div className="mt-1 text-xs text-slate-500">{txn.reason} · {new Date(txn.createdAt).toLocaleString()}</div>
            </div>
          ))}
          {(item.tokenTxns?.length ?? 0) === 0 && <div className="text-sm text-slate-500">Операций пока нет</div>}
        </div>
      </section>
    </div>
  );
}
