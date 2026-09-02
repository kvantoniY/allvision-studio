'use client';

import { useState } from 'react';
import { BarChart3, Loader2, Plus, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  useCreatePromoCodeMutation,
  useDeletePromoCodeMutation,
  useListPromoCodesQuery,
  useListPromoUsesQuery,
  useUpdatePromoCodeMutation,
  type AdminPromoCode,
} from '@/store/api/admin-promo-codes-api';
import { cn } from '@/lib/utils';

/**
 * Промокоды на пополнение баланса.
 *
 * Главное здесь не CRUD, а колонка «использований»: коды заводятся, чтобы разложить их по
 * рекламным каналам и увидеть, откуда приходят платящие. Поэтому в таблице рядом с кодом
 * стоят его метка канала, число оплаченных пополнений и сумма, которую они принесли.
 */
export default function AdminPromoCodesPage() {
  const { data, isLoading } = useListPromoCodesQuery();
  const [createPromo, createState] = useCreatePromoCodeMutation();
  const [updatePromo] = useUpdatePromoCodeMutation();
  const [deletePromo] = useDeletePromoCodeMutation();
  const [openUsesId, setOpenUsesId] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    description: '',
    source: '',
    discountType: 'PERCENT' as 'PERCENT' | 'FIXED',
    discountValue: 20,
    maxUses: '' as string,
    expiresAt: '',
  });

  const submit = async () => {
    try {
      await createPromo({
        code: form.code,
        description: form.description || null,
        source: form.source || null,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        // Пустое поле — без ограничения: так и задумано, а не «забыли заполнить».
        maxUses: form.maxUses.trim() === '' ? null : Number(form.maxUses),
        expiresAt: form.expiresAt ? new Date(`${form.expiresAt}T23:59:59`).toISOString() : null,
      }).unwrap();
      setForm({ ...form, code: '', description: '', source: '', maxUses: '', expiresAt: '' });
      toast({ title: 'Промокод создан' });
    } catch (err) {
      const message = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось создать промокод', description: message, variant: 'destructive' });
    }
  };

  const promos = data?.promoCodes ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Промокоды</h1>
        <p className="mt-1 text-sm text-slate-400">
          Скидка на пополнение баланса. Токенов начисляется столько же, сколько в пакете, —
          дешевле становится сама покупка. Использование засчитывается только после оплаты,
          поэтому число в таблице показывает покупки, а не попытки ввода.
        </p>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Plus className="h-4 w-4" />
          Новый промокод
        </h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className="block text-xs text-slate-400">
            Код
            <Input
              value={form.code}
              onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })}
              placeholder="BLOGGER10"
              className="mt-1 h-9 font-mono"
            />
          </label>

          <label className="block text-xs text-slate-400">
            Канал (для отчёта)
            <Input
              value={form.source}
              onChange={(event) => setForm({ ...form, source: event.target.value })}
              placeholder="ролик у блогера"
              className="mt-1 h-9"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-slate-400">
              Скидка
              <select
                value={form.discountType}
                onChange={(event) => setForm({ ...form, discountType: event.target.value as 'PERCENT' | 'FIXED' })}
                className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
              >
                <option value="PERCENT">Процент</option>
                <option value="FIXED">Рубли</option>
              </select>
            </label>
            <label className="block text-xs text-slate-400">
              {form.discountType === 'PERCENT' ? 'Процентов' : 'Рублей'}
              <Input
                type="number"
                min={1}
                value={form.discountValue}
                onChange={(event) => setForm({ ...form, discountValue: Number(event.target.value) })}
                className="mt-1 h-9"
              />
            </label>
          </div>

          <label className="block text-xs text-slate-400">
            Использований (пусто — без лимита)
            <Input
              type="number"
              min={1}
              value={form.maxUses}
              onChange={(event) => setForm({ ...form, maxUses: event.target.value })}
              placeholder="без ограничения"
              className="mt-1 h-9"
            />
          </label>

          <label className="block text-xs text-slate-400">
            Действует до (необязательно)
            <Input
              type="date"
              value={form.expiresAt}
              onChange={(event) => setForm({ ...form, expiresAt: event.target.value })}
              className="mt-1 h-9"
            />
          </label>

          <label className="block text-xs text-slate-400">
            Описание
            <Input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="Скидка для подписчиков"
              className="mt-1 h-9"
            />
          </label>
        </div>

        <Button type="button" className="mt-3" disabled={createState.isLoading || form.code.trim().length < 2} onClick={() => void submit()}>
          {createState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
          Создать
        </Button>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/60">
        {isLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Загружаем промокоды…
          </p>
        ) : promos.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Промокодов пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Код</th>
                  <th className="px-4 py-3">Канал</th>
                  <th className="px-4 py-3">Скидка</th>
                  <th className="px-4 py-3">Использований</th>
                  <th className="px-4 py-3">Принесли</th>
                  <th className="px-4 py-3">Действует</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {promos.map((promo) => (
                  <PromoRow
                    key={promo.id}
                    promo={promo}
                    usesOpen={openUsesId === promo.id}
                    onToggleUses={() => setOpenUsesId((current) => (current === promo.id ? null : promo.id))}
                    onToggleActive={() => void updatePromo({ id: promo.id, isActive: !promo.isActive })}
                    onDelete={async () => {
                      if (!window.confirm(`Удалить ${promo.code}? Вместе с ним пропадёт и его статистика.`)) return;
                      await deletePromo(promo.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function PromoRow({
  promo,
  usesOpen,
  onToggleUses,
  onToggleActive,
  onDelete,
}: {
  promo: AdminPromoCode;
  usesOpen: boolean;
  onToggleUses: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  const exhausted = promo.maxUses != null && promo.usedCount >= promo.maxUses;
  const expired = Boolean(promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now());

  return (
    <>
      <tr className="border-b border-slate-800/70">
        <td className="px-4 py-3">
          <span className="font-mono font-semibold text-slate-100">{promo.code}</span>
          {promo.description && <span className="block text-xs text-slate-500">{promo.description}</span>}
        </td>
        <td className="px-4 py-3 text-slate-300">{promo.source || <span className="text-slate-600">—</span>}</td>
        <td className="px-4 py-3 text-slate-200">
          {promo.discountType === 'PERCENT' ? `−${promo.discountValue}%` : `−${promo.discountValue} ₽`}
        </td>
        <td className="px-4 py-3">
          <span className={cn('font-semibold', exhausted ? 'text-amber-300' : 'text-slate-100')}>
            {promo.stats.uses}
          </span>
          <span className="text-slate-500"> / {promo.maxUses ?? '∞'}</span>
        </td>
        <td className="px-4 py-3 text-slate-300">
          {promo.stats.paidRub.toLocaleString('ru-RU')} ₽
          {promo.stats.discountRub > 0 && (
            <span className="block text-xs text-slate-500">скидок на {promo.stats.discountRub.toLocaleString('ru-RU')} ₽</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-slate-400">
          {promo.expiresAt ? new Date(promo.expiresAt).toLocaleDateString('ru-RU') : 'бессрочно'}
          {expired && <span className="block text-amber-300">истёк</span>}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onToggleUses}
              title="Кто и когда воспользовался"
              className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggleActive}
              title={promo.isActive ? 'Выключить: код перестанет применяться' : 'Включить'}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition',
                promo.isActive
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                  : 'border-slate-700 text-slate-500 hover:text-slate-300',
              )}
            >
              {promo.isActive ? 'Активен' : 'Выключен'}
            </button>
            <button
              type="button"
              onClick={onDelete}
              title="Удалить вместе со статистикой — лучше просто выключить"
              className="grid h-7 w-7 place-items-center rounded border border-slate-700 text-slate-500 transition hover:border-rose-400/60 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
      {usesOpen && <PromoUsesRow promoId={promo.id} />}
    </>
  );
}

function PromoUsesRow({ promoId }: { promoId: string }) {
  const { data, isLoading } = useListPromoUsesQuery(promoId);
  const uses = data?.uses ?? [];

  return (
    <tr className="border-b border-slate-800/70 bg-slate-950/50">
      <td colSpan={7} className="px-4 py-3">
        {isLoading ? (
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Загружаем историю…
          </span>
        ) : uses.length === 0 ? (
          <span className="text-xs text-slate-500">Кодом ещё не пользовались — оплаченных пополнений с ним нет.</span>
        ) : (
          <div className="space-y-1">
            {uses.map((use) => (
              <div key={use.id} className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="font-mono text-slate-500">{new Date(use.createdAt).toLocaleString('ru-RU')}</span>
                <span className="text-slate-200">{use.user.email}</span>
                <span>оплатил {use.paidRub.toLocaleString('ru-RU')} ₽</span>
                <span className="text-emerald-300">скидка {use.discountRub.toLocaleString('ru-RU')} ₽</span>
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}
