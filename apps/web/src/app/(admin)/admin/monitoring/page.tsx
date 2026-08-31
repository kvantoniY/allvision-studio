'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  type MonitoringErrorItem,
  type MonitoringHealth,
  type MonitoringIndicator,
  useGetMonitoringQuery,
  useUpdateMonitoringIndicatorsMutation,
} from '@/store/api/admin-monitoring-api';

const HEALTH_META: Record<MonitoringHealth, { label: string; dot: string; text: string; ring: string }> = {
  ok: { label: 'В норме', dot: 'bg-emerald-500', text: 'text-emerald-300', ring: 'ring-emerald-500/30' },
  warn: { label: 'Внимание', dot: 'bg-amber-500', text: 'text-amber-300', ring: 'ring-amber-500/30' },
  down: { label: 'Проблема', dot: 'bg-red-500', text: 'text-red-300', ring: 'ring-red-500/40' },
  unknown: { label: 'Нет данных', dot: 'bg-slate-500', text: 'text-slate-400', ring: 'ring-zinc-700' },
};

function StatusDot({ health }: { health: MonitoringHealth }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${HEALTH_META[health].dot}`} />;
}

function daysLabel(days: number | null | undefined) {
  if (days === null || days === undefined) return 'н/д';
  if (days < 0) return `просрочено ${Math.abs(days)} дн.`;
  if (days === 0) return 'истекает сегодня';
  return `осталось ${days} дн.`;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleDateString('ru-RU');
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '—';
  return new Date(ts).toLocaleString('ru-RU');
}

function AutoTile({
  label,
  health,
  value,
  detail,
  href,
}: {
  label: string;
  health: MonitoringHealth;
  value: string;
  detail?: string;
  href?: string;
}) {
  const meta = HEALTH_META[health];
  const body = (
    <div className={`h-full rounded-lg border border-zinc-800 bg-zinc-950 p-4 ring-1 ring-inset ${meta.ring}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <StatusDot health={health} />
      </div>
      <div className={`mt-2 text-xl font-bold ${meta.text}`}>{value}</div>
      {detail ? <div className="mt-1 truncate text-xs text-slate-500">{detail}</div> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function newIndicator(): MonitoringIndicator {
  return {
    id: '',
    label: '',
    category: '',
    note: '',
    url: '',
    trackDate: true,
    expiresAt: null,
    warnDays: 14,
    trackBalance: false,
    balance: null,
    balanceUnit: '₽',
    warnBalance: null,
    manualStatus: 'auto',
  };
}

export default function AdminMonitoringPage() {
  const { data, isFetching, refetch } = useGetMonitoringQuery(undefined, { pollingInterval: 60_000 });
  const [save, saveState] = useUpdateMonitoringIndicatorsMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MonitoringIndicator[]>([]);

  useEffect(() => {
    if (!editing && data?.indicators) setDraft(data.indicators);
  }, [data?.indicators, editing]);

  const auto = data?.auto;
  const errors = data?.errors;

  const indicators = editing ? draft : data?.indicators ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, MonitoringIndicator[]>();
    for (const ind of indicators) {
      const key = ind.category?.trim() || 'Прочее';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ind);
    }
    return Array.from(map.entries());
  }, [indicators]);

  const problemCount = (data?.indicators ?? []).filter((i) => i.health === 'down').length
    + [auto?.ssl?.health, auto?.whois?.health, auto?.captcha?.health, auto?.falBalance?.health].filter((h) => h === 'down').length;

  const patch = (id: string, changes: Partial<MonitoringIndicator>) => {
    setDraft((prev) => prev.map((ind) => (ind.id === id ? { ...ind, ...changes } : ind)));
  };

  const startEdit = () => {
    setDraft(data?.indicators ?? []);
    setEditing(true);
  };

  const addIndicator = () => {
    setDraft((prev) => [...prev, { ...newIndicator(), id: `new-${Date.now()}-${prev.length}` }]);
  };

  const removeIndicator = (id: string) => {
    setDraft((prev) => prev.filter((ind) => ind.id !== id));
  };

  const onSave = async () => {
    const invalid = draft.find((ind) => !ind.label.trim());
    if (invalid) {
      toast({ title: 'У каждого индикатора должно быть название', variant: 'destructive' });
      return;
    }
    try {
      await save({ indicators: draft.map((ind) => ({ ...ind, id: ind.id.startsWith('new-') ? '' : ind.id })) }).unwrap();
      toast({ title: 'Индикаторы сохранены' });
      setEditing(false);
    } catch {
      toast({ title: 'Не удалось сохранить', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Мониторинг запуска</h1>
          <p className="mt-2 text-sm text-slate-400">
            Подписки, балансы, сроки и автоматические проверки. Всё, что можно проебать на запуске — в одном месте.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {problemCount > 0 ? (
            <Badge className="bg-red-700">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" />
              Проблем: {problemCount}
            </Badge>
          ) : (
            <Badge className="bg-emerald-600">Всё в норме</Badge>
          )}
          <Button type="button" variant="outline" disabled={isFetching} onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>
      </div>

      {/* Автоматические проверки */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Автопроверки</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AutoTile
            label="SSL сертификат"
            health={(auto?.ssl?.health as MonitoringHealth) ?? 'unknown'}
            value={auto?.ssl?.available ? daysLabel(auto.ssl.daysLeft) : 'недоступно'}
            detail={auto?.ssl?.available ? `до ${fmtDate(auto.ssl.validTo)} · ${auto.ssl.issuer ?? auto.ssl.host ?? ''}` : auto?.ssl?.error}
          />
          <AutoTile
            label="Домен (WHOIS)"
            health={(auto?.whois?.health as MonitoringHealth) ?? 'unknown'}
            value={auto?.whois?.available ? daysLabel(auto.whois.daysLeft) : 'вручную'}
            detail={auto?.whois?.available ? `${auto.whois.domain} · до ${fmtDate(auto.whois.validTo)}` : `${auto?.domain ?? ''} · автопроверка недоступна`}
          />
          <AutoTile
            label="Капча"
            health={auto?.captcha?.health ?? 'unknown'}
            value={auto?.captcha?.enabled ? (auto.captcha.health === 'ok' ? 'работает' : 'проверьте') : 'выключена'}
            detail={auto?.captcha?.note}
          />
          <AutoTile
            label="Баланс fal.ai"
            health={auto?.falBalance?.health ?? 'unknown'}
            value={auto?.falBalance?.available ? `$${(auto.falBalance.balanceUsd ?? 0).toFixed(2)}` : 'н/д'}
            detail={auto?.falBalance?.available ? `обновлено ${fmtDateTime(auto.falBalance.checkedAt)}` : auto?.falBalance?.error}
            href="/admin/diagnostics"
          />
        </div>
      </section>

      {/* Ручные индикаторы */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Подписки и балансы (ручной ввод)</h2>
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={addIndicator}>
                  <Plus className="h-4 w-4" />
                  Добавить
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Отмена
                </Button>
                <Button type="button" size="sm" disabled={saveState.isLoading} onClick={onSave} className="bg-violet-600 hover:bg-violet-500">
                  <Check className="h-4 w-4" />
                  Сохранить
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={startEdit}>
                Настроить
              </Button>
            )}
          </div>
        </div>

        {editing ? (
          <div className="space-y-3">
            {draft.length === 0 ? (
              <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-slate-500">
                Нажмите «Добавить», чтобы создать индикатор (домен, прокси, СМС-сервис, Яндекс ВМ и т.д.).
              </p>
            ) : null}
            {draft.map((ind) => (
              <IndicatorEditor key={ind.id} indicator={ind} onChange={(c) => patch(ind.id, c)} onRemove={() => removeIndicator(ind.id)} />
            ))}
          </div>
        ) : indicators.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-slate-500">
            Индикаторы не настроены. Нажмите «Настроить», чтобы добавить домен, прокси, СМС-сервис, баланс Яндекс ВМ и другое.
          </p>
        ) : (
          <div className="space-y-5">
            {grouped.map(([category, items]) => (
              <div key={category}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{category}</div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((ind) => (
                    <IndicatorCard key={ind.id} indicator={ind} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ошибки генераций */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ошибки генераций за 24 часа</h2>
          <div className="flex items-center gap-2 text-sm">
            <Badge className={errors && errors.failedCount > 0 ? 'bg-red-700' : 'bg-emerald-600'}>Ошибок: {errors?.failedCount ?? 0}</Badge>
            <Badge className="bg-zinc-700">Успешно: {errors?.completedCount ?? 0}</Badge>
          </div>
        </div>

        {errors && errors.byCode.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {errors.byCode.map((row) => (
              <span key={row.code} className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs text-slate-300">
                {row.code} · <span className="font-semibold text-red-300">{row.count}</span>
              </span>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {(errors?.items ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-slate-500">За сутки ошибок генераций нет.</p>
          ) : (
            (errors?.items ?? []).map((item) => <ErrorRow key={item.id} item={item} />)
          )}
        </div>
      </section>
    </div>
  );
}

function IndicatorCard({ indicator }: { indicator: MonitoringIndicator }) {
  const health = indicator.health ?? 'unknown';
  const meta = HEALTH_META[health];
  return (
    <div className={`rounded-lg border border-zinc-800 bg-zinc-950 p-4 ring-1 ring-inset ${meta.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusDot health={health} />
            <span className="truncate font-medium text-white">{indicator.label}</span>
          </div>
          <div className={`mt-0.5 text-xs ${meta.text}`}>{meta.label}</div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5 text-sm">
        {indicator.trackDate ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Оплачено до</span>
            <span className="text-slate-200">
              {fmtDate(indicator.expiresAt)} <span className={meta.text}>· {daysLabel(indicator.daysLeft)}</span>
            </span>
          </div>
        ) : null}
        {indicator.trackBalance ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Баланс</span>
            <span className="text-slate-200">
              {indicator.balance ?? '—'} {indicator.balanceUnit}
            </span>
          </div>
        ) : null}
      </div>

      {indicator.note ? <p className="mt-3 whitespace-pre-wrap text-xs text-slate-400">{indicator.note}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-600">
        {indicator.url ? (
          <a href={indicator.url} target="_blank" rel="noreferrer" className="truncate text-violet-300 hover:underline">
            Кабинет →
          </a>
        ) : (
          <span />
        )}
        {indicator.updatedAt ? <span>обновлено {fmtDate(indicator.updatedAt)}</span> : null}
      </div>
    </div>
  );
}

function IndicatorEditor({
  indicator,
  onChange,
  onRemove,
}: {
  indicator: MonitoringIndicator;
  onChange: (changes: Partial<MonitoringIndicator>) => void;
  onRemove: () => void;
}) {
  const numOrNull = (v: string): number | null => (v.trim() === '' ? null : Number(v));
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-start gap-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Название</Label>
            <Input value={indicator.label} placeholder="Домен allvision-pulse.ru" onChange={(e) => onChange({ label: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Категория</Label>
            <Input value={indicator.category} placeholder="Инфраструктура / Провайдеры" onChange={(e) => onChange({ category: e.target.value })} />
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="text-red-400 hover:text-red-300" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={indicator.trackDate} onChange={(e) => onChange({ trackDate: e.target.checked })} />
            Отслеживать дату (оплачено до)
          </label>
          {indicator.trackDate ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Дата</Label>
                <Input
                  type="date"
                  value={indicator.expiresAt ? indicator.expiresAt.slice(0, 10) : ''}
                  onChange={(e) => onChange({ expiresAt: e.target.value ? e.target.value : null })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Предупреждать за (дней)</Label>
                <Input type="number" min={0} value={indicator.warnDays ?? ''} onChange={(e) => onChange({ warnDays: numOrNull(e.target.value) })} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-zinc-800 p-3">
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={indicator.trackBalance} onChange={(e) => onChange({ trackBalance: e.target.checked })} />
            Отслеживать баланс
          </label>
          {indicator.trackBalance ? (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Баланс</Label>
                <Input type="number" value={indicator.balance ?? ''} onChange={(e) => onChange({ balance: numOrNull(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ед.</Label>
                <Input value={indicator.balanceUnit} onChange={(e) => onChange({ balanceUnit: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Мин.</Label>
                <Input type="number" value={indicator.warnBalance ?? ''} onChange={(e) => onChange({ warnBalance: numOrNull(e.target.value) })} />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Ссылка на кабинет</Label>
          <Input value={indicator.url} placeholder="https://..." onChange={(e) => onChange({ url: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Статус вручную</Label>
          <select
            value={indicator.manualStatus}
            onChange={(e) => onChange({ manualStatus: e.target.value as MonitoringIndicator['manualStatus'] })}
            className="flex h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-slate-100"
          >
            <option value="auto">Авто (по дате/балансу)</option>
            <option value="ok">В норме</option>
            <option value="warn">Внимание</option>
            <option value="down">Проблема</option>
          </select>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <Label className="text-xs">Заметка (логин, тариф, инструкция по оплате)</Label>
        <Textarea value={indicator.note} rows={2} onChange={(e) => onChange({ note: e.target.value })} />
      </div>
    </div>
  );
}

function ErrorRow({ item }: { item: MonitoringErrorItem }) {
  const inputPreview = (() => {
    try {
      if (item.userInputs && typeof item.userInputs === 'object') return JSON.stringify(item.userInputs, null, 2);
    } catch {
      /* ignore */
    }
    return null;
  })();
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
        <span className="rounded bg-red-900/40 px-2 py-0.5 font-mono text-xs text-red-300">{item.errorCode ?? 'UNKNOWN'}</span>
        <span className="text-white">{item.service?.title ?? item.title}</span>
        <span className="text-slate-500">· {item.user?.email ?? 'аноним'}</span>
        <span className="ml-auto text-xs text-slate-500">{fmtDateTime(item.createdAt)}</span>
      </summary>

      <div className="mt-3 space-y-3 text-xs">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Услуга" value={item.service?.slug ?? item.mode} />
          <Field label="Тариф / стоимость" value={`${item.selectedTier ?? '—'} · ${item.tokensCost} токенов`} />
          <Field label="Проект" value={item.id} href={`/admin/projects/${item.id}`} />
          <Field label="Пользователь" value={item.user?.email ?? '—'} href={item.user ? `/admin/users/${item.user.id}` : undefined} />
        </div>

        {item.errorMessage ? (
          <div>
            <div className="mb-1 text-slate-500">Причина</div>
            <div className="whitespace-pre-wrap rounded bg-zinc-900 p-2 text-slate-300">{item.errorMessage}</div>
          </div>
        ) : null}

        {inputPreview ? (
          <div>
            <div className="mb-1 text-slate-500">Ввод пользователя</div>
            <pre className="max-h-60 overflow-auto rounded bg-zinc-900 p-2 text-slate-400">{inputPreview}</pre>
          </div>
        ) : null}

        {item.inputText ? (
          <div>
            <div className="mb-1 text-slate-500">Текст ввода</div>
            <div className="whitespace-pre-wrap rounded bg-zinc-900 p-2 text-slate-300">{item.inputText}</div>
          </div>
        ) : null}

        {item.aiUsageLogs.length > 0 ? (
          <div>
            <div className="mb-1 text-slate-500">Вызовы AI</div>
            <div className="space-y-1">
              {item.aiUsageLogs.map((log, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded bg-zinc-900 p-2 text-slate-400">
                  <span className="font-mono text-slate-300">{log.blockSlug ?? '—'}</span>
                  <span>· {log.model ?? '—'}</span>
                  <span className="rounded bg-red-900/40 px-1.5 text-red-300">{log.status}</span>
                  {log.errorCode ? <span className="text-red-300">{log.errorCode}</span> : null}
                  {log.errorMessage ? <span className="w-full text-slate-500">{log.errorMessage}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      {href ? (
        <Link href={href} className="break-all text-violet-300 hover:underline">
          {value}
        </Link>
      ) : (
        <div className="break-all text-slate-300">{value}</div>
      )}
    </div>
  );
}
