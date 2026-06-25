'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Check, Copy, Trash2 } from 'lucide-react';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { type AdminProject, type AdminProjectUsageLog, useDeleteAdminProjectMutation, useGetAdminProjectQuery } from '@/store/api/admin-projects-api';

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

function jsonBlock(value: unknown) {
  if (value === undefined || value === null) return 'Данные отсутствуют';
  return JSON.stringify(value, null, 2);
}

function hasLogPayload(value: unknown) {
  return value !== undefined && value !== null;
}

function reconstructedRequestPayload(project: AdminProject, log: AdminProjectUsageLog) {
  return {
    notice: 'Точный provider request не был записан для этого лога. Ниже восстановленный контекст из проекта и AIUsageLog.',
    providerCall: {
      provider: log.provider,
      model: log.model,
      blockSlug: log.blockSlug,
      taskId: log.taskId,
      createdAt: log.createdAt,
    },
    generationInput: {
      projectId: project.id,
      userId: project.user.id,
      service: project.service
        ? {
            id: project.service.id,
            slug: project.service.slug,
            title: project.service.title,
          }
        : null,
      projectTitle: project.title,
      selectedTier: project.selectedTier,
      inputText: project.inputText,
      userInputs: project.userInputs,
    },
  };
}

function reconstructedResponsePayload(project: AdminProject, log: AdminProjectUsageLog) {
  return {
    notice: 'Точный provider response не был записан для этого лога. Ниже технический итог, который сохранился в AIUsageLog и Project.',
    providerResult: {
      status: log.status,
      taskId: log.taskId,
      durationMs: log.durationMs,
      costUsd: log.costUsd,
      recoverableOutputUrl: log.recoverableOutputUrl,
      errorCode: log.errorCode,
      errorMessage: log.errorMessage,
    },
    projectResult: {
      status: project.status,
      progress: project.progress,
      errorCode: project.errorCode,
      errorMessage: project.errorMessage,
      resultImage: project.resultImage,
      resultVideo: project.resultVideo,
    },
  };
}

function requestPayloadForDisplay(project: AdminProject, log: AdminProjectUsageLog) {
  return hasLogPayload(log.requestPayload) ? log.requestPayload : reconstructedRequestPayload(project, log);
}

function responsePayloadForDisplay(project: AdminProject, log: AdminProjectUsageLog) {
  return hasLogPayload(log.responsePayload) ? log.responsePayload : reconstructedResponsePayload(project, log);
}

function usageLogText(project: AdminProject, log: AdminProjectUsageLog) {
  const exactRequest = hasLogPayload(log.requestPayload);
  const exactResponse = hasLogPayload(log.responsePayload);
  return [
    `Проект: ${project.title}`,
    `Project ID: ${project.id}`,
    `Пользователь: ${project.user.email} (${project.user.id})`,
    `Сервис: ${project.service?.title ?? 'н/д'}`,
    `Время: ${new Date(log.createdAt).toLocaleString('ru-RU')}`,
    `Статус: ${usageStatusLabel(log.status)}`,
    `Блок: ${log.blockSlug}`,
    `Провайдер: ${log.provider}`,
    `Модель: ${log.model}`,
    `Task ID: ${log.taskId ?? 'н/д'}`,
    `Длительность: ${log.durationMs} ms`,
    `Стоимость: $${log.costUsd}`,
    `Recoverable output: ${log.recoverableOutputUrl ?? 'н/д'}`,
    `Ошибка: ${log.errorCode ?? 'нет'}`,
    `Сообщение ошибки: ${log.errorMessage ?? 'нет'}`,
    '',
    exactRequest ? 'REQUEST (точный provider payload):' : 'REQUEST (восстановленный контекст, точный provider payload не был записан):',
    jsonBlock(requestPayloadForDisplay(project, log)),
    '',
    exactResponse ? 'RESPONSE (точный provider response):' : 'RESPONSE (восстановленный итог, точный provider response не был записан):',
    jsonBlock(responsePayloadForDisplay(project, log)),
  ].join('\n');
}

export default function AdminProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const project = useGetAdminProjectQuery(params.id);
  const [deleteProject, deleteState] = useDeleteAdminProjectMutation();
  const settings = useGetAdminSettingsQuery();
  const rate = settings.data?.settings.usdToRub ?? 80;

  const copyLog = async (log: AdminProjectUsageLog) => {
    if (!project.data?.project) return;
    await navigator.clipboard.writeText(usageLogText(project.data.project, log));
    setCopiedLogId(log.id);
    window.setTimeout(() => setCopiedLogId((current) => (current === log.id ? null : current)), 1600);
  };

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
        <div className="mt-4 space-y-3">
          {(item.aiUsageLogs ?? []).length === 0 && <div className="text-sm text-slate-500">AI-вызовов нет</div>}
          {(item.aiUsageLogs ?? []).map((log) => (
            <ProjectUsageLogCard
              key={log.id}
              project={item}
              log={log}
              copied={copiedLogId === log.id}
              usdToRub={rate}
              onCopy={() => {
                void copyLog(log);
              }}
            />
          ))}
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

function ProjectUsageLogCard({
  project,
  log,
  copied,
  usdToRub,
  onCopy,
}: {
  project: AdminProject;
  log: AdminProjectUsageLog;
  copied: boolean;
  usdToRub: number;
  onCopy: () => void;
}) {
  const hasError = Boolean(log.errorCode || log.errorMessage);
  const hasExactRequest = hasLogPayload(log.requestPayload);
  const hasExactResponse = hasLogPayload(log.responsePayload);
  const hasMissingExactPayload = !hasExactRequest || !hasExactResponse;

  return (
    <article className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={log.status === 'success' ? 'bg-emerald-600' : 'bg-red-700'}>{usageStatusLabel(log.status)}</Badge>
            <span className="text-sm font-semibold text-white">{new Date(log.createdAt).toLocaleString('ru-RU')}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{log.blockSlug}</span>
            <span>{log.provider}</span>
            <span>{log.model}</span>
            <span>{log.taskId ?? 'нет taskId'}</span>
            <span>{Math.round(log.durationMs / 1000)} с</span>
            <span>{formatMoney({ usd: log.costUsd }, { primary: 'usd', showAll: true, usdToRub })}</span>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Скопировано' : 'Копировать'}
        </Button>
      </div>

      {hasMissingExactPayload && (
        <div className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100">
          Точный request/response не сохранился в этой старой записи. Ниже показан восстановленный контекст из проекта и usage-лога.
        </div>
      )}

      {hasError && (
        <div className="mt-3 rounded-md border border-violet-900/60 bg-violet-950/20 p-3">
          <div className="text-sm font-medium text-violet-200">{log.errorCode ?? 'Ошибка провайдера'}</div>
          {log.errorMessage && <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-violet-100/80">{log.errorMessage}</pre>}
        </div>
      )}

      <details className="mt-3" open>
        <summary className="cursor-pointer text-sm font-medium text-slate-300">Запрос и ответ</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <ProjectJsonBlock
            title={hasExactRequest ? 'Запрос: точный provider payload' : 'Запрос: восстановленный контекст'}
            value={requestPayloadForDisplay(project, log)}
          />
          <ProjectJsonBlock
            title={hasExactResponse ? 'Ответ: точный provider response' : 'Ответ: восстановленный итог'}
            value={responsePayloadForDisplay(project, log)}
          />
        </div>
      </details>
    </article>
  );
}

function ProjectJsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase text-slate-500">{title}</div>
      <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed text-slate-200">
        {jsonBlock(value)}
      </pre>
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
