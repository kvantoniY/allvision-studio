'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import {
  useGetAdminDiagnosticsStateQuery,
  useRefreshPiAPIBalanceMutation,
  useReloadServicesCatalogMutation,
} from '@/store/api/admin-diagnostics-api';
import { useGetAdminSettingsQuery, useUpdateAdminSettingsMutation } from '@/store/api/admin-settings-api';
import { useGetAdminUsageQuery } from '@/store/api/admin-usage-api';

function seconds(value: number | null | undefined) {
  if (value === null || value === undefined) return 'н/д';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return `${hours} ч ${minutes} мин`;
}

function projectStatusLabel(status: string) {
  if (status === 'PENDING') return 'Ожидает';
  if (status === 'PROCESSING') return 'В работе';
  if (status === 'COMPLETED') return 'Готов';
  if (status === 'FAILED') return 'Ошибка';
  return status;
}

export default function AdminDiagnosticsPage() {
  const state = useGetAdminDiagnosticsStateQuery();
  const usage = useGetAdminUsageQuery();
  const settings = useGetAdminSettingsQuery();
  const [updateSettings, updateSettingsState] = useUpdateAdminSettingsMutation();
  const [refreshBalance, refreshState] = useRefreshPiAPIBalanceMutation();
  const [reloadCatalog, reloadState] = useReloadServicesCatalogMutation();
  const [rateDraft, setRateDraft] = useState('80');
  const data = state.data;
  const usdToRub = settings.data?.settings.usdToRub ?? 80;
  const sevenDaySpend = usage.data?.summary.totalCostUsd ?? 0;
  const dailySpend = sevenDaySpend / 7;
  const balanceDays = data?.piapiBalance.balanceUsd && dailySpend > 0 ? Math.floor(data.piapiBalance.balanceUsd / dailySpend) : null;

  useEffect(() => {
    if (settings.data?.settings.usdToRub) setRateDraft(String(settings.data.settings.usdToRub));
  }, [settings.data?.settings.usdToRub]);

  const saveRate = async () => {
    try {
      await updateSettings({ usdToRub: Number(rateDraft) }).unwrap();
      toast({ title: 'Курс сохранён' });
    } catch {
      toast({ title: 'Не удалось сохранить курс', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Диагностика</h1>
          <p className="mt-2 text-sm text-slate-400">Состояние прода, очереди, последние ошибки, медиа-файлы и переменные окружения.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => state.refetch()}>
            <RefreshCw className="h-4 w-4" />
            Обновить
          </Button>
          <Button type="button" variant="outline" disabled={refreshState.isLoading} onClick={() => refreshBalance()}>
            <RefreshCw className="h-4 w-4" />
            Обновить баланс PiAPI
          </Button>
          <Button type="button" variant="outline" disabled={reloadState.isLoading} onClick={() => reloadCatalog()}>
            <RotateCcw className="h-4 w-4" />
            Перезагрузить каталог услуг
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Сборка" value={data?.build.version ?? 'загрузка'} detail={data?.build.gitSha ?? data?.build.nodeEnv ?? ''} />
        <Metric label="Аптайм API" value={seconds(data?.uptime.apiSeconds)} />
        <Metric label="Аптайм воркера" value={seconds(data?.uptime.workerSeconds)} />
        <Metric
          label="Баланс PiAPI"
          value={typeof data?.piapiBalance.balanceUsd === 'number' ? formatMoney({ usd: data.piapiBalance.balanceUsd }, { primary: 'usd', showAll: true, usdToRub }) : 'н/д'}
          detail={balanceDays === null ? (data?.piapiBalance.errorCode ?? data?.piapiBalance.lastChecked ?? '') : `Хватит на ~${balanceDays} дней · ${formatMoney({ usd: dailySpend }, { primary: 'usd', showAll: true, usdToRub })}/день`}
          tone={data?.piapiBalance.lowBalance ? 'danger' : 'ok'}
        />
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Настройки валюты</h2>
        <div className="mt-4 flex max-w-md items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="usdToRub">Курс USD к рублю</Label>
            <Input id="usdToRub" type="number" min={1} step="0.01" value={rateDraft} onChange={(event) => setRateDraft(event.target.value)} />
          </div>
          <Button type="button" disabled={updateSettingsState.isLoading} onClick={saveRate} className="bg-rose-500 hover:bg-rose-400">Сохранить</Button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Очереди задач</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-2">Очередь</th>
                <th className="p-2">Ожидают</th>
                <th className="p-2">Активные</th>
                <th className="p-2">Упало</th>
                <th className="p-2">Падений/час</th>
                <th className="p-2">Статус</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(data?.queues ?? []).map((queue) => (
                <tr key={queue.name}>
                  <td className="p-2 text-white">{queue.name}</td>
                  <td className="p-2">{queue.waiting}</td>
                  <td className="p-2">{queue.active}</td>
                  <td className="p-2">{queue.failed}</td>
                  <td className="p-2">{queue.failedLastHour}</td>
                  <td className="p-2">
                    <Badge className={queue.available ? 'bg-emerald-600' : 'bg-red-700'}>{queue.available ? 'в норме' : 'недоступна'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">Последние проекты</h2>
          <div className="mt-4 space-y-3">
            {(data?.recentProjects ?? []).map((project) => (
              <Link key={project.id} href={`/admin/projects/${project.id}`} className="block rounded-md border border-zinc-800 bg-zinc-900 p-3 hover:border-rose-400">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-white">{project.title}</span>
                  <Badge className={project.status === 'FAILED' ? 'bg-red-700' : 'bg-zinc-700'}>{projectStatusLabel(String(project.status))}</Badge>
                </div>
                <div className="mt-1 text-xs text-slate-500">{project.service?.slug ?? 'без услуги'} · {new Date(project.createdAt).toLocaleString()}</div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-semibold text-white">Последние ошибки</h2>
          <div className="mt-4 space-y-3">
            {(data?.recentErrors ?? []).map((error, index) => (
              <details key={String(error.id ?? index)} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                <summary className="cursor-pointer text-sm text-rose-200">{String(error.errorCode ?? error.status ?? error.source ?? 'ошибка')}</summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify(error, null, 2)}</pre>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Медиа-файлы</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="p-2">Тип</th>
                <th className="p-2">Название</th>
                <th className="p-2">Файл</th>
                <th className="p-2">Размер</th>
                <th className="p-2">Активен</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(data?.mediaAssets ?? []).map((asset) => {
                const file = asset.file as { exists?: boolean; size?: number } | undefined;
                return (
                  <tr key={String(asset.id)}>
                    <td className="p-2">{String(asset.kind)}</td>
                    <td className="p-2 text-white">{String(asset.title)}</td>
                    <td className="p-2"><Badge className={file?.exists ? 'bg-emerald-600' : 'bg-red-700'}>{file?.exists ? 'есть' : 'нет'}</Badge></td>
                    <td className="p-2">{file?.size ? `${Math.round(file.size / 1024)} KB` : String(asset.fileSize ?? 'н/д')}</td>
                    <td className="p-2">{asset.isActive ? 'да' : 'нет'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Переменные окружения</h2>
        <div className="mt-4 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(data?.env ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <div className="font-medium text-slate-300">{key}</div>
              <div className="mt-1 break-all text-slate-500">{value ?? 'null'}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={tone === 'danger' ? 'mt-2 text-2xl font-bold text-red-300' : tone === 'ok' ? 'mt-2 text-2xl font-bold text-emerald-300' : 'mt-2 text-2xl font-bold text-white'}>{value}</div>
      {detail && <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>}
    </div>
  );
}
