'use client';

import { useParams, useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { type AdminProject, useDeleteAdminProjectMutation, useGetAdminProjectQuery } from '@/store/api/admin-projects-api';

function statusLabel(status: AdminProject['status']) {
  if (status === 'PENDING') return 'Ожидает';
  if (status === 'PROCESSING') return 'В работе';
  if (status === 'COMPLETED') return 'Готов';
  return 'Ошибка';
}

function usageStatusLabel(status: string) {
  if (status === 'success') return 'Успешно';
  if (status === 'failed') return 'Ошибка';
  if (status === 'timeout') return 'Таймаут';
  if (status === 'timeout_charged') return 'Таймаут списан';
  if (status === 'timeout_pending') return 'Таймаут ожидает';
  return status;
}

export default function AdminProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const project = useGetAdminProjectQuery(params.id);
  const [deleteProject, deleteState] = useDeleteAdminProjectMutation();
  const settings = useGetAdminSettingsQuery();
  const rate = settings.data?.settings.usdToRub ?? 80;

  if (project.isLoading) return <div className="text-slate-400">Загрузка...</div>;
  if (!project.data?.project) return <div className="text-slate-400">Проект не найден</div>;
  const item = project.data.project;

  const remove = async () => {
    if (!window.confirm(`Удалить генерацию "${item.title}"? Запись и временные файлы будут удалены полностью.`)) return;
    try {
      await deleteProject(item.id).unwrap();
      router.push('/admin/projects');
    } catch {
      window.alert('Не удалось удалить генерацию');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/projects')}>Назад к проектам</Button>
        <h1 className="mt-3 text-3xl font-bold text-white">{item.title}</h1>
        <p className="mt-2 text-sm text-slate-400">{item.user.email} · {item.service?.title ?? 'Без услуги'} · {new Date(item.createdAt).toLocaleString()}</p>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="destructive" disabled={deleteState.isLoading} onClick={remove}>
          <Trash2 className="h-4 w-4" />
          Удалить генерацию
        </Button>
      </div>

      <section className="grid gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-5 md:grid-cols-4">
        <Metric label="Статус" value={statusLabel(item.status)} />
        <Metric label="Прогресс" value={`${item.progress}%`} />
        <Metric label="Себестоимость" value={formatMoney({ usd: item.costUsd }, { primary: 'usd', showAll: true, usdToRub: rate })} />
        <Metric label="Цена" value={formatMoney({ coins: item.userPriceCoins }, { primary: 'coins', showAll: true, usdToRub: rate })} />
      </section>

      {item.errorCode && (
        <section className="rounded-lg border border-red-900/70 bg-red-950/30 p-5">
          <h2 className="font-semibold text-red-100">Ошибка</h2>
          <div className="mt-2 text-sm text-red-100">{item.errorCode}</div>
          {item.errorMessage && <p className="mt-2 text-sm text-red-200/80">{item.errorMessage}</p>}
        </section>
      )}

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">AI-вызовы</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500">
              <tr>
                <th className="p-2">Дата</th>
                <th className="p-2">Блок</th>
                <th className="p-2">Модель</th>
                <th className="p-2">Статус</th>
                <th className="p-2">Стоимость</th>
                <th className="p-2">Ошибка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(item.aiUsageLogs ?? []).map((log) => (
                <tr key={String(log.id)}>
                  <td className="p-2">{new Date(String(log.createdAt)).toLocaleString()}</td>
                  <td className="p-2">{log.blockSlug}</td>
                  <td className="p-2">{log.model}</td>
                  <td className="p-2"><Badge className={log.status === 'success' ? 'bg-emerald-600' : 'bg-red-700'}>{usageStatusLabel(String(log.status))}</Badge></td>
                  <td className="p-2">{formatMoney({ usd: log.costUsd }, { primary: 'usd', showAll: true, usdToRub: rate })}</td>
                  <td className="p-2 text-rose-200">{String(log.errorCode ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <h2 className="font-semibold text-white">Технические данные</h2>
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-md border border-zinc-800 bg-zinc-900 p-4 text-xs text-slate-300">
          {JSON.stringify({
            pipelineSnapshot: item.pipelineSnapshot,
            userInputs: item.userInputs,
            stepProgress: item.stepProgress,
            resultImage: item.resultImage,
            resultVideo: item.resultVideo,
          }, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
