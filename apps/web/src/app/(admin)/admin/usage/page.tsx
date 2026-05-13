'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGetAdminUsageQuery, useGetPiAPIAccountQuery } from '@/store/api/admin-usage-api';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';

function statusClass(status: string) {
  if (status === 'success') return 'bg-emerald-600';
  if (status === 'timeout' || status.startsWith('timeout_')) return 'bg-amber-600';
  return 'bg-red-700';
}

const usageStatusLabels: Record<string, string> = {
  success: 'Успешно',
  failed: 'Ошибки',
  timeout: 'Таймауты',
  timeout_charged: 'Таймаут списан',
  timeout_pending: 'Таймаут ожидает',
};

const usageFilterFields = [
  { key: 'provider', label: 'Провайдер', placeholder: 'piapi' },
  { key: 'blockSlug', label: 'Блок', placeholder: 'image-to-video' },
  { key: 'model', label: 'Модель', placeholder: 'kling-3-pro' },
] as const satisfies ReadonlyArray<{ key: 'provider' | 'blockSlug' | 'model'; label: string; placeholder: string }>;

export default function AdminUsagePage() {
  const [filters, setFilters] = useState({ provider: '', blockSlug: '', model: '', status: '' });
  const usage = useGetAdminUsageQuery({
    provider: filters.provider || undefined,
    blockSlug: filters.blockSlug || undefined,
    model: filters.model || undefined,
    status: filters.status || undefined,
  });
  const account = useGetPiAPIAccountQuery();
  const settings = useGetAdminSettingsQuery();
  const usdToRub = settings.data?.settings.usdToRub ?? 80;
  const maxSpend = Math.max(0.01, ...(usage.data?.byDay.map((day) => day.totalCostUsd) ?? [0.01]));
  const sevenDaySpend = usage.data?.summary.totalCostUsd ?? 0;
  const dailySpend = sevenDaySpend / 7;
  const balanceDays = account.data && dailySpend > 0 ? Math.floor(account.data.balanceUsd / dailySpend) : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Аналитика расходов</h1>
          <p className="mt-2 text-sm text-slate-400">Расход PiAPI, здоровье запросов, последние ошибки провайдера и статистика по моделям.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { usage.refetch(); account.refetch(); }}>
          <RefreshCw className="h-4 w-4" />
          Обновить
        </Button>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        {account.data ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-400">Баланс PiAPI</div>
              <div className={account.data.lowBalance ? 'text-2xl font-bold text-red-300' : 'text-2xl font-bold text-emerald-300'}>
                {formatMoney({ usd: account.data.balanceUsd }, { primary: 'usd', showAll: true, usdToRub })}
              </div>
            </div>
            <div className="text-sm text-slate-500">Проверено {new Date(account.data.lastChecked).toLocaleString()}</div>
          </div>
        ) : (
          <div className="text-sm text-amber-200">Баланс PiAPI недоступен: {account.error ? 'проверьте env API или доступ провайдера' : 'загрузка...'}</div>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="text-sm text-slate-400">Прогноз</div>
        <div className="mt-2 text-xl font-semibold text-white">
          {balanceDays === null
            ? 'Пока недостаточно данных о расходах'
            : balanceDays <= 3
              ? `При текущем темпе баланс закончится через ~${balanceDays} дня`
              : `Хватит на ~${balanceDays} дней при текущем темпе`}
        </div>
        <p className="mt-1 text-xs text-slate-500">По последним 7 дням: {formatMoney({ usd: sevenDaySpend }, { primary: 'usd', showAll: true, usdToRub })} всего, {formatMoney({ usd: dailySpend }, { primary: 'usd', showAll: true, usdToRub })} в день.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Metric label="Всего вызовов" value={String(usage.data?.summary.totalRequests ?? 0)} />
        <Metric label="Успешно" value={String(usage.data?.summary.successCount ?? 0)} />
        <Metric label="Ошибки" value={String(usage.data?.summary.failedCount ?? 0)} />
        <Metric label="Таймауты" value={String(usage.data?.summary.timeoutCount ?? 0)} />
        <Metric label="Расход" value={formatMoney({ usd: usage.data?.summary.totalCostUsd ?? 0 }, { primary: 'usd', showAll: true, usdToRub })} />
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {(['success', 'failed', 'timeout', 'timeout_charged', 'timeout_pending'] as const).map((statusKey) => (
          <Metric key={statusKey} label={usageStatusLabels[statusKey]} value={String(usage.data?.summary.statusCounts?.[statusKey] ?? 0)} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">Расход по дням</h2>
          <div className="mt-5 flex h-48 items-end gap-3">
            {(usage.data?.byDay ?? []).map((day) => (
              <div key={day.date} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t bg-rose-500"
                  style={{ height: `${Math.max(4, (day.totalCostUsd / maxSpend) * 160)}px` }}
                  title={`${day.date}: ${formatMoney({ usd: day.totalCostUsd }, { primary: 'usd', showAll: true, usdToRub })}`}
                />
                <div className="text-[10px] text-slate-500">{day.date.slice(5)}</div>
              </div>
            ))}
            {(usage.data?.byDay.length ?? 0) === 0 && <div className="text-sm text-slate-500">За период нет вызовов</div>}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">По моделям</h2>
          <div className="mt-4 space-y-3">
            {(usage.data?.byModel ?? []).map((item) => (
              <div key={item.model} className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-white">{item.model}</span>
                  <span className="text-slate-400">{formatMoney({ usd: item.totalCostUsd }, { primary: 'usd', showAll: true, usdToRub })}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{item.requestCount} вызовов · среднее {Math.round(item.avgDurationMs / 1000)} с</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {(usage.data?.timeoutPending.length ?? 0) > 0 && (
        <section className="rounded-lg border border-amber-900/60 bg-amber-950/20 p-5">
          <h2 className="font-semibold text-amber-100">Задачи timeout_pending</h2>
          <p className="mt-1 text-sm text-amber-200/70">Эти задачи можно будет восстановить через async-fetch в следующем этапе.</p>
          <div className="mt-4 space-y-2">
            {usage.data?.timeoutPending.map((item) => (
              <div key={item.id} className="rounded-md border border-amber-900/50 bg-zinc-950 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-3">
                  <span className="font-medium text-white">{item.taskId ?? 'нет taskId'}</span>
                  <span className="text-slate-500">{new Date(item.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{item.blockSlug} · {item.model} · {item.projectId ?? 'нет проекта'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid gap-4 md:grid-cols-4">
          {usageFilterFields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label>{field.label}</Label>
              <Input value={filters[field.key]} placeholder={field.placeholder} onChange={(event) => setFilters((current) => ({ ...current, [field.key]: event.target.value }))} />
            </div>
          ))}
          <div className="space-y-2">
            <Label>Статус</Label>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
              className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
            >
              <option value="">Все статусы</option>
              <option value="success">Успешно</option>
              <option value="failed">Ошибки</option>
              <option value="timeout">Таймауты</option>
              <option value="timeout_charged">Таймаут списан</option>
              <option value="timeout_pending">Таймаут ожидает</option>
            </select>
          </div>
        </div>
      </section>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-slate-400">
            <tr>
              <th className="p-3">Дата</th>
              <th className="p-3">Услуга</th>
              <th className="p-3">Блок/модель</th>
              <th className="p-3">Статус</th>
              <th className="p-3">Стоимость</th>
              <th className="p-3">Ошибка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(usage.data?.logs ?? []).map((log) => (
              <tr key={log.id} className="bg-zinc-900/60">
                <td className="p-3 text-slate-300">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="p-3">
                  <div className="text-white">{log.project?.service?.title ?? log.project?.title ?? 'н/д'}</div>
                  <div className="text-xs text-slate-500">{log.userId ?? 'нет пользователя'}</div>
                </td>
                <td className="p-3 text-slate-300">
                  <div>{log.blockSlug}</div>
                  <div className="text-xs text-slate-500">{log.model}</div>
                </td>
                <td className="p-3"><Badge className={statusClass(log.status)}>{usageStatusLabels[log.status] ?? log.status}</Badge></td>
                <td className="p-3 text-slate-300" title={`Точная стоимость: $${log.costUsd}`}>
                  {formatMoney({ usd: log.costUsd }, { primary: 'usd', showAll: true, usdToRub })} · {Math.round(log.durationMs / 1000)} с
                </td>
                <td className="p-3">
                  {log.errorCode ? (
                    <details>
                      <summary className="cursor-pointer text-rose-300">{log.errorCode}</summary>
                      <p className="mt-2 max-w-md text-xs text-slate-400">{log.errorMessage}</p>
                    </details>
                  ) : (
                    <span className="text-slate-600">нет</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
