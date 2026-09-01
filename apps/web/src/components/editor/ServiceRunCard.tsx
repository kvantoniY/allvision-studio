'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Wand2 } from 'lucide-react';
import { editorLaunchBlocker } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TokenIcon } from '@/components/ui/token-icon';
import type { EditorCatalogService } from '@/store/api/editor-catalog-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

type ServiceField = {
  id: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string; disabled?: boolean }>;
  aspectOptions?: string[];
  defaultAspect?: string;
  durationOptions?: number[];
  defaultDuration?: number;
  defaultValue?: string;
  placeholder?: string;
};

const PHOTO_TYPES = new Set(['photo', 'avatar']);
const SETTING_TYPES = ['select', 'aspect_ratio', 'duration', 'checkbox', 'text', 'textarea'];

function serviceFields(form: unknown): ServiceField[] {
  return Array.isArray(form) ? (form as ServiceField[]) : [];
}

/**
 * Карточка выбранной услуги: обложка, описание, её собственные настройки и запуск.
 *
 * Настройки берутся из формы самой услуги, а не выдумываются: сколько у неё фото-полей —
 * столько слотов референса, есть формат или длительность — показываем её же варианты.
 *
 * Кадр выделенного слоя подставляется в первый слот, но его можно снять: человек может
 * собирать кадр из своих файлов, а не из того, что уже лежит в сцене.
 */
export function ServiceRunCard({
  service,
  price,
  running,
  sceneFrameUrl,
  onUploadReference,
  onBack,
  onRun,
}: {
  service: EditorCatalogService;
  price: number;
  running: boolean;
  /** Кадр выделенного слоя: подставляется в первый слот, пока его не сняли. */
  sceneFrameUrl?: string | null;
  onUploadReference: (file: File) => Promise<string | null>;
  onBack: () => void;
  onRun: (values: Record<string, string>) => void;
}) {
  const video = service.previewMode === 'image' ? null : mediaUrl(service.previewVideo);
  const cover = mediaUrl(service.previewImage ?? service.coverImage);
  const fields = useMemo(() => serviceFields(service.userInputForm), [service.userInputForm]);
  const photoFields = useMemo(() => fields.filter((field) => PHOTO_TYPES.has(field.type)), [fields]);
  const settingFields = fields.filter((field) => SETTING_TYPES.includes(field.type));

  const [values, setValues] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  // Значения по умолчанию берём из самой услуги, кадр сцены — в первый слот.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      if (field.type === 'aspect_ratio' && field.defaultAspect) next[field.id] = field.defaultAspect;
      if (field.type === 'duration' && field.defaultDuration) next[field.id] = String(field.defaultDuration);
      if (field.defaultValue) next[field.id] = field.defaultValue;
    }
    if (sceneFrameUrl && photoFields[0]) next[photoFields[0].id] = sceneFrameUrl;
    setValues(next);
    // Пересобираем только при смене услуги: правки пользователя затирать нельзя.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.slug]);

  const setValue = (id: string, value: string) => setValues((current) => ({ ...current, [id]: value }));
  const clearValue = (id: string) => setValues((current) => {
    const next = { ...current };
    delete next[id];
    return next;
  });

  const pickFile = (fieldId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(fieldId);
      try {
        const url = await onUploadReference(file);
        if (url) setValue(fieldId, url);
      } finally {
        setUploading(null);
      }
    };
    input.click();
  };

  const firstPhotoId = photoFields[0]?.id;
  const blocker = editorLaunchBlocker(service.userInputForm, values, Boolean(firstPhotoId && values[firstPhotoId]));

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Назад к услугам
      </button>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        <div className="relative aspect-[16/10] bg-slate-900">
          {video ? (
            <video src={video} autoPlay muted loop playsInline className="h-full w-full object-cover" />
          ) : cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt={service.title} className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="space-y-2 p-3">
          <h4 className="text-sm font-semibold text-slate-100">{service.title}</h4>
          <p className="whitespace-pre-line text-xs leading-5 text-slate-400">
            {service.description || service.shortDesc}
          </p>
        </div>
      </div>

      {photoFields.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-slate-300">Референсы</span>
          <div className="grid grid-cols-2 gap-1.5">
            {photoFields.map((field) => {
              const url = values[field.id];
              return (
                <div key={field.id} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => pickFile(field.id)}
                    className="relative block aspect-square w-full overflow-hidden rounded-lg border border-dashed border-slate-700 bg-slate-950 transition hover:border-violet-400"
                  >
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl(url) ?? url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center text-slate-600">
                        {uploading === field.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[10px] text-slate-500">{field.label ?? 'Фото'}</span>
                    {url && (
                      <button
                        type="button"
                        onClick={() => clearValue(field.id)}
                        className="shrink-0 text-[10px] text-slate-500 transition hover:text-rose-300"
                      >
                        убрать
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {settingFields.map((field) => (
        <div key={field.id} className="space-y-1">
          <span className="text-[11px] text-slate-400">{field.label ?? field.id}</span>

          {field.type === 'aspect_ratio' && (
            <div className="flex flex-wrap gap-1">
              {(field.aspectOptions ?? ['auto', '9:16', '16:9', '1:1']).map((option) => (
                <ChoicePill key={option} active={values[field.id] === option} onClick={() => setValue(field.id, option)}>
                  {option === 'auto' ? 'Авто' : option}
                </ChoicePill>
              ))}
            </div>
          )}

          {field.type === 'duration' && (
            <div className="flex flex-wrap gap-1">
              {(field.durationOptions ?? [5, 10]).map((option) => (
                <ChoicePill
                  key={option}
                  active={values[field.id] === String(option)}
                  onClick={() => setValue(field.id, String(option))}
                >
                  {option} с
                </ChoicePill>
              ))}
            </div>
          )}

          {field.type === 'select' && (
            <select
              value={values[field.id] ?? ''}
              onChange={(event) => setValue(field.id, event.target.value)}
              className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
            >
              <option value="">Не выбрано</option>
              {(field.options ?? []).filter((option) => !option.disabled).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}

          {field.type === 'checkbox' && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={values[field.id] === 'true'}
                onChange={(event) => setValue(field.id, event.target.checked ? 'true' : 'false')}
                className="h-3.5 w-3.5 accent-violet-500"
              />
              включить
            </label>
          )}

          {(field.type === 'text' || field.type === 'textarea') && (
            <Input
              value={values[field.id] ?? ''}
              onChange={(event) => setValue(field.id, event.target.value)}
              placeholder={field.placeholder}
              className="h-8 border-slate-700 bg-slate-900 text-xs"
            />
          )}
        </div>
      ))}

      {running ? (
        // Процента здесь нет намеренно: карточка услуги — не место ожидания, отсюда сразу
        // запускают ещё одну генерацию. Ход работы показывает вкладка «Мои генерации».
        <div className="space-y-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-violet-100">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Генерация запущена
          </div>
          <p className="text-[11px] text-slate-400">
            Результат встанет в клип и появится в «Моих генерациях» — можно не ждать здесь и
            запустить ещё одну.
          </p>
        </div>
      ) : blocker ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-4 text-amber-200">
          {blocker}
        </p>
      ) : (
        <Button type="button" className="w-full" onClick={() => onRun(values)}>
          <Wand2 className="h-4 w-4" />
          Сгенерировать за {price}
          <TokenIcon className="h-[1em] w-[1em]" />
        </Button>
      )}
    </div>
  );
}

function ChoicePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs transition',
        active
          ? 'border-violet-400 bg-violet-500/20 text-violet-100'
          : 'border-slate-700 text-slate-300 hover:border-slate-500',
      )}
    >
      {children}
    </button>
  );
}
