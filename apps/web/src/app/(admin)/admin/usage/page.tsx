'use client';

import { useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import { formatMoney } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type AdminUsageLog, useGetAdminAnalyticsOverviewQuery, useGetAdminUsageQuery, useGetFalAccountQuery } from '@/store/api/admin-usage-api';
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
  { key: 'provider', label: 'Провайдер', placeholder: 'fal' },
  { key: 'blockSlug', label: 'Блок', placeholder: 'image-to-video' },
  { key: 'model', label: 'Модель', placeholder: 'kling-3-pro' },
] as const satisfies ReadonlyArray<{ key: 'provider' | 'blockSlug' | 'model'; label: string; placeholder: string }>;

function formatLogTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function jsonBlock(value: unknown) {
  if (value === undefined || value === null) return 'Данные отсутствуют';
  return JSON.stringify(value, null, 2);
}

function hasLogPayload(value: unknown) {
  return value !== undefined && value !== null;
}

function pipelineSteps(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function matchingPipelineStep(log: AdminUsageLog) {
  return pipelineSteps(log.project?.pipelineSnapshot).find((step) => step.blockSlug === log.blockSlug) ?? null;
}

function reconstructedRequestPayload(log: AdminUsageLog) {
  const pipelineStep = matchingPipelineStep(log);
  return {
    notice: 'Точный provider request не был записан для этого лога. Обычно это значит, что генерация была создана до включения requestPayload/responsePayload или worker еще не был обновлен. Ниже восстановленный контекст из проекта и usage-лога.',
    providerCall: {
      provider: log.provider,
      model: log.model,
      blockSlug: log.blockSlug,
      taskId: log.taskId,
      createdAt: log.createdAt,
    },
    generationInput: {
      projectId: log.projectId,
      userId: log.userId,
      service: log.project?.service
        ? {
            id: log.project.service.id,
            slug: log.project.service.slug,
            title: log.project.service.title,
          }
        : null,
      projectTitle: log.project?.title ?? null,
      selectedTier: log.project?.selectedTier ?? null,
      inputText: log.project?.inputText ?? null,
      inputImages: log.project?.inputImages ?? [],
      userInputs: log.project?.userInputs ?? null,
    },
    pipelineStep,
    pipelineSnapshot: log.project?.pipelineSnapshot ?? null,
  };
}

function reconstructedResponsePayload(log: AdminUsageLog) {
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
    stepProgress: log.project?.stepProgress ?? null,
    aiProviderLogs: log.project?.aiProviderLogs ?? null,
    projectResult: log.project
      ? {
          status: log.project.status,
          progress: log.project.progress,
          errorCode: log.project.errorCode,
          errorMessage: log.project.errorMessage,
          resultImage: log.project.resultImage,
          resultVideo: log.project.resultVideo,
          resultThumbnail: log.project.resultThumbnail,
          resultAssets: log.project.resultAssets,
        }
      : null,
  };
}

function requestPayloadForDisplay(log: AdminUsageLog) {
  return hasLogPayload(log.requestPayload) ? log.requestPayload : reconstructedRequestPayload(log);
}

function responsePayloadForDisplay(log: AdminUsageLog) {
  return hasLogPayload(log.responsePayload) ? log.responsePayload : reconstructedResponsePayload(log);
}

function buildGenerationLogText(log: AdminUsageLog) {
  const exactRequest = hasLogPayload(log.requestPayload);
  const exactResponse = hasLogPayload(log.responsePayload);
  return [
    `Время: ${formatLogTime(log.createdAt)}`,
    `Статус: ${usageStatusLabels[log.status] ?? log.status}`,
    `Генерация: ${log.project?.service?.title ?? log.project?.title ?? 'н/д'}`,
    `Project ID: ${log.projectId ?? 'н/д'}`,
    `User ID: ${log.userId ?? 'н/д'}`,
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
    jsonBlock(requestPayloadForDisplay(log)),
    '',
    exactResponse ? 'RESPONSE (точный provider response):' : 'RESPONSE (восстановленный итог, точный provider response не был записан):',
    jsonBlock(responsePayloadForDisplay(log)),
  ].join('\n');
}

export default function AdminUsagePage() {
  const [filters, setFilters] = useState({ provider: '', blockSlug: '', model: '', status: '' });
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const usage = useGetAdminUsageQuery({
    limit: 100,
    provider: filters.provider || undefined,
    blockSlug: filters.blockSlug || undefined,
    model: filters.model || undefined,
    status: filters.status || undefined,
  });
  const account = useGetFalAccountQuery();
  const overview = useGetAdminAnalyticsOverviewQuery();
  const settings = useGetAdminSettingsQuery();
  const usdToRub = settings.data?.settings.usdToRub ?? 80;
  const maxSpend = Math.max(0.01, ...(usage.data?.byDay.map((day) => day.totalCostUsd) ?? [0.01]));
  const sevenDaySpend = usage.data?.summary.totalCostUsd ?? 0;
  const dailySpend = sevenDaySpend / 7;
  const balanceDays = account.data && dailySpend > 0 ? Math.floor(account.data.balanceUsd / dailySpend) : null;
  const logs = usage.data?.logs ?? [];

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedLogId(id);
    window.setTimeout(() => setCopiedLogId((current) => (current === id ? null : current)), 1600);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">AI-консоль генераций</h1>
          <p className="mt-2 text-sm text-slate-400">Расход fal.ai, здоровье запросов, история генераций, ошибки, request и response провайдера.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => { usage.refetch(); account.refetch(); overview.refetch(); }}>
          <RefreshCw className="h-4 w-4" />
          Обновить
        </Button>
      </div>

      {overview.data && (
        <div className="space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Бизнес-обзор · 30 дней</h2>

          {/* Деньги */}
          <div>
            <div className="mb-2 text-xs font-medium text-slate-400">Деньги</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <BizCard
                label="Пополнения"
                value={`${overview.data.payments.amountRub.toLocaleString('ru-RU')} ₽`}
                hint={`${overview.data.payments.count} платежей · +${overview.data.payments.coinsAdded.toLocaleString('ru-RU')} токенов`}
                accent="emerald"
              />
              <BizCard
                label="Выручка с генераций"
                value={`${overview.data.finance.revenueCoins.toLocaleString('ru-RU')} токенов`}
                hint="оплачено за завершённые генерации"
                accent="violet"
              />
              <BizCard
                label="Расход fal.ai"
                value={formatMoney({ usd: overview.data.finance.providerCostUsd }, { primary: 'usd', showAll: true, usdToRub })}
                hint={`${overview.data.finance.providerRequests} вызовов провайдера`}
                accent="rose"
              />
              <BizCard
                label="Чистая прибыль"
                value={`${Math.round(overview.data.finance.netProfitRub).toLocaleString('ru-RU')} ₽`}
                hint="выручка − себестоимость генераций"
                accent={overview.data.finance.netProfitRub >= 0 ? 'emerald' : 'rose'}
              />
            </div>
          </div>

          {/* Пользователи и генерации */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BizCard label="Пользователей всего" value={overview.data.users.total.toLocaleString('ru-RU')} hint={`+${overview.data.users.new} за период`} accent="slate" />
            <BizCard label="Генераций за период" value={overview.data.generations.total.toLocaleString('ru-RU')} hint={`завершено ${overview.data.generations.completed} · ошибок ${overview.data.generations.failed}`} accent="slate" />
            <BizCard label="Конверсия в результат" value={overview.data.generations.total ? `${Math.round((overview.data.generations.completed / overview.data.generations.total) * 100)}%` : '—'} hint="завершено / всего" accent="slate" />
            <BizCard label="Визиты на сайт" value="—" hint="нужна веб-аналитика (Я.Метрика/GA)" accent="slate" />
          </div>

          {/* Популярные услуги */}
          <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
            <h3 className="font-semibold text-white">Популярные услуги</h3>
            <p className="mt-1 text-xs text-slate-500">Сколько раз запускали каждую услугу за период — для отслеживания трендов.</p>
            <div className="mt-4 space-y-2">
              {overview.data.topServices.length === 0 && <div className="text-sm text-slate-500">За период запусков услуг нет</div>}
              {overview.data.topServices.slice(0, 12).map((service, index) => {
                const max = overview.data!.topServices[0]?.runs || 1;
                return (
                  <div key={service.serviceId} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="w-5 shrink-0 text-slate-500">{index + 1}</span>
                        <span className="truncate font-medium text-white">{service.title}</span>
                      </span>
                      <span className="shrink-0 text-slate-400">
                        {service.runs} запусков · {service.revenueCoins.toLocaleString('ru-RU')} токенов
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(4, (service.runs / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        {account.data ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-400">Баланс fal.ai{account.data.username ? ` · ${account.data.username}` : ''}</div>
              <div className={account.data.lowBalance ? 'text-2xl font-bold text-red-300' : 'text-2xl font-bold text-emerald-300'}>
                {formatMoney({ usd: account.data.balanceUsd }, { primary: 'usd', showAll: true, usdToRub })}
              </div>
            </div>
            <div className="text-sm text-slate-500">Проверено {new Date(account.data.lastChecked).toLocaleString()}</div>
          </div>
        ) : (
          <div className="text-sm text-amber-200">Баланс fal.ai недоступен: {account.error ? 'проверьте FAL_BILLING_KEY или доступ' : 'загрузка...'}</div>
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
                  className="w-full rounded-t bg-violet-500"
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

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Консоль генераций</h2>
            <p className="mt-1 text-sm text-slate-500">{logs.length} записей в текущей выборке</p>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={logs.length === 0}
            onClick={() => {
              void copyText('visible', logs.map(buildGenerationLogText).join('\n\n---\n\n'));
            }}
          >
            {copiedLogId === 'visible' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copiedLogId === 'visible' ? 'Скопировано' : 'Скопировать видимые'}
          </Button>
        </div>

        <div className="space-y-3">
          {logs.length === 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 text-sm text-slate-500">
              За выбранный период логов генераций нет
            </div>
          )}
          {logs.map((log) => (
            <GenerationLogCard
              key={log.id}
              log={log}
              copied={copiedLogId === log.id}
              usdToRub={usdToRub}
              onCopy={() => {
                void copyText(log.id, buildGenerationLogText(log));
              }}
            />
          ))}
        </div>
      </section>

    </div>
  );
}

function GenerationLogCard({
  log,
  copied,
  usdToRub,
  onCopy,
}: {
  log: AdminUsageLog;
  copied: boolean;
  usdToRub: number;
  onCopy: () => void;
}) {
  const title = log.project?.service?.title ?? log.project?.title ?? 'н/д';
  const hasError = Boolean(log.errorCode || log.errorMessage);
  const hasExactRequest = hasLogPayload(log.requestPayload);
  const hasExactResponse = hasLogPayload(log.responsePayload);
  const hasMissingExactPayload = !hasExactRequest || !hasExactResponse;

  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={statusClass(log.status)}>{usageStatusLabels[log.status] ?? log.status}</Badge>
            <span className="text-sm font-semibold text-white">{formatLogTime(log.createdAt)}</span>
            <span className="text-xs text-slate-500">{log.provider}</span>
          </div>
          <div className="mt-2 text-sm text-slate-200">{title}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>{log.blockSlug}</span>
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
        <div className="mt-4 rounded-md border border-amber-900/60 bg-amber-950/20 p-3 text-xs leading-relaxed text-amber-100">
          Точный request/response не сохранился в этой старой записи. Ниже показан восстановленный контекст: входные данные проекта,
          model/block/taskId, итоговый статус, результат и ошибка. Новые генерации после обновления worker будут хранить точный payload провайдера.
        </div>
      )}

      {hasError && (
        <div className="mt-4 rounded-md border border-violet-900/60 bg-violet-950/20 p-3 text-sm">
          <div className="font-medium text-violet-200">{log.errorCode ?? 'Ошибка провайдера'}</div>
          {log.errorMessage && <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-violet-100/80">{log.errorMessage}</pre>}
        </div>
      )}

      <details className="mt-4" open>
        <summary className="cursor-pointer text-sm font-medium text-slate-300">
          Запрос и ответ
        </summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <JsonLogBlock
            title={hasExactRequest ? 'Запрос: точный provider payload' : 'Запрос: восстановленный контекст'}
            value={requestPayloadForDisplay(log)}
          />
          <JsonLogBlock
            title={hasExactResponse ? 'Ответ: точный provider response' : 'Ответ: восстановленный итог'}
            value={responsePayloadForDisplay(log)}
          />
        </div>
      </details>

      <div className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
        <div>Project ID: {log.projectId ?? 'н/д'}</div>
        <div>User ID: {log.userId ?? 'н/д'}</div>
        <div>Log ID: {log.id}</div>
        <div>Output: {log.recoverableOutputUrl ?? 'н/д'}</div>
      </div>
    </article>
  );
}

function JsonLogBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="min-w-0 rounded-md border border-zinc-800 bg-zinc-900">
      <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase text-slate-500">{title}</div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words p-3 text-xs leading-relaxed text-slate-200">
        {jsonBlock(value)}
      </pre>
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

const BIZ_ACCENT: Record<string, string> = {
  violet: 'border-violet-500/30 bg-violet-500/5',
  amber: 'border-amber-500/30 bg-amber-500/5',
  emerald: 'border-emerald-500/30 bg-emerald-500/5',
  rose: 'border-violet-500/30 bg-violet-500/5',
  slate: 'border-zinc-800 bg-zinc-950',
};

function BizCard({ label, value, hint, accent = 'slate' }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${BIZ_ACCENT[accent] ?? BIZ_ACCENT.slate}`}>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}
