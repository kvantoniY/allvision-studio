'use client';

import { X } from 'lucide-react';
import { chatReferenceSlots, type ChatModelOption, type PiAPIParamCapability } from '@allvision/shared';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InputSourcePicker } from './InputSourcePicker';

/**
 * Расширенные настройки модели.
 *
 * Каталог хранит технические английские ключи провайдера, поэтому здесь же лежит словарь
 * человеческих названий. Файл общий для чата и редактора: настройки одной и той же модели
 * должны выглядеть и вести себя одинаково в обоих местах — иначе человек, привыкший к чату,
 * не найдёт в редакторе знакомого переключателя.
 */

export type ChatAdvancedParams = Record<string, string | number | boolean | string[] | undefined>;

const paramLabelRu: Record<string, string> = {
  output_format: 'Формат файла',
  resolution: 'Качество',
  expand_prompt: 'Улучшать описание автоматически',
  negative_prompt: 'Что исключить из результата',
  seed: 'Seed (для повторяемости)',
  image_urls: 'Изображения-референсы',
  images: 'Изображения-референсы',
  video_urls: 'Видео-референсы',
  video: 'Видео-референс',
  audio_urls: 'Аудио-референсы',
  audio_url: 'Аудио-референс',
  tail_image_url: 'Последний кадр',
  camera_control: 'Движение камеры',
  shot_type: 'Тип съёмки',
  watermark: 'Водяной знак провайдера',
  keep_original_sound: 'Сохранить исходный звук',
  keep_original_audio: 'Сохранить исходный звук',
  video_url: 'Видео с движением',
  preset_motion: 'Готовое движение',
  motion_direction: 'Источник движения',
  target_video: 'Видео для замены лица',
  estimatedFrames: 'Оценка кадров (для расчёта цены)',
  swap_faces_index: 'Какие лица взять с фото',
  target_faces_index: 'Какие лица заменить в видео',
  prefer_multi_shots: 'Несколько сцен в ролике',
  multi_shots: 'Описание сцен (JSON)',
};

const paramDescriptionRu: Record<string, string> = {
  images: 'Дополнительные изображения. В описании ссылайтесь на них как @image_1, @image_2.',
  video: 'Дополнительное видео. В описании ссылайтесь на него как @video.',
  negative_prompt: 'Опишите словами, чего не должно быть в результате.',
  preset_motion: 'Готовый шаблон движения вместо своего видео.',
  multi_shots: 'Для продвинутых: список сцен в формате JSON. Оставьте пустым для обычного ролика.',
  estimatedFrames: 'Влияет только на предварительную оценку стоимости.',
  target_video: 'Видео, в котором заменим лицо на загруженное.',
};

const optionLabelRu: Record<string, string> = {
  '': 'Авто',
  auto: 'Авто',
  horizontal: 'Горизонтальное',
  vertical: 'Вертикальное',
  zoom: 'Зум',
  pan: 'Панорама',
  tilt: 'Наклон',
  roll: 'Вращение',
  fixed: 'Фиксированная камера',
  handheld: 'Съёмка с рук',
  tracking: 'Слежение за объектом',
  video: 'По видео с движением',
  preset: 'По готовому движению',
};

export function ruParamLabel(param: PiAPIParamCapability) {
  return paramLabelRu[param.key] ?? param.title;
}

export function ruParamDescription(param: PiAPIParamCapability) {
  return paramDescriptionRu[param.key];
}

export function ruOptionLabel(option: { value: string; label: string }) {
  return optionLabelRu[option.value] ?? option.label;
}

export function controlledAdvancedKeys(model: ChatModelOption) {
  return new Set([
    'aspect_ratio',
    'duration',
    'resolution',
    ...(model.audioParam ? [model.audioParam] : []),
  ]);
}

export function visibleAdvancedParams(model: ChatModelOption) {
  const controlled = controlledAdvancedKeys(model);
  // Слот-параметры (последний кадр, видео движения, target video...) прикрепляются единой
  // скрепкой — прячем их из расширенных настроек, чтобы у одного референса не было двух
  // конкурирующих мест прикрепления.
  const slotParams = new Set(chatReferenceSlots(model).map((slot) => slot.param));
  return model.advancedParams.filter((param) => !controlled.has(param.key) && !slotParams.has(param.key));
}

export function defaultAdvancedParams(model: ChatModelOption): ChatAdvancedParams {
  const defaults: ChatAdvancedParams = {};
  if (model.supportedResolutions.length > 0) {
    defaults.resolution = model.defaultResolution ?? model.supportedResolutions[0];
  }
  for (const param of visibleAdvancedParams(model)) {
    if (param.default !== undefined && param.default !== '') {
      defaults[param.key] = param.default;
    }
  }
  return defaults;
}

export function normaliseAdvancedParams(params: ChatAdvancedParams) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      if (Array.isArray(value)) return value.length > 0;
      return true;
    }),
  );
}

export function sourceListValue(value: ChatAdvancedParams[string]): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

export const advancedSectionsMeta = {
  references: { title: 'Дополнительные референсы' },
  quality: { title: 'Качество и детали' },
  motion: { title: 'Движение' },
  audio: { title: 'Звук' },
  prompt: { title: 'Описание' },
} as const;

export type AdvancedSectionKey = keyof typeof advancedSectionsMeta;

export function advancedSectionForParam(param: PiAPIParamCapability): AdvancedSectionKey {
  if (param.kind === 'source-list' || ['image_urls', 'video_urls', 'audio_urls', 'images', 'video', 'video_url', 'target_video', 'tail_image_url'].includes(param.key)) return 'references';
  if (param.key.includes('audio') || param.key.includes('sound')) return 'audio';
  if (['camera_control', 'shot_type', 'preset_motion', 'motion_direction', 'prefer_multi_shots', 'multi_shots'].includes(param.key)) return 'motion';
  if (['resolution', 'quality', 'seed', 'estimatedFrames'].includes(param.key)) return 'quality';
  return 'prompt';
}

/** Группы параметров модели с заголовками — плоский список из двух десятков полей нечитаем. */
export function advancedParamSections(model: ChatModelOption) {
  const params = visibleAdvancedParams(model);
  return (Object.keys(advancedSectionsMeta) as AdvancedSectionKey[])
    .map((key) => ({
      key,
      title: advancedSectionsMeta[key].title,
      params: params.filter((param) => advancedSectionForParam(param) === key),
    }))
    .filter((section) => section.params.length > 0);
}

export function AdvancedParamField({
  param,
  value,
  onChange,
}: {
  param: PiAPIParamCapability;
  value: ChatAdvancedParams[string];
  onChange: (value: ChatAdvancedParams[string]) => void;
}) {
  const label = ruParamLabel(param);
  const hint = ruParamDescription(param);

  if (param.kind === 'boolean') {
    return (
      <label className="flex items-center gap-2.5 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block">{label}</span>
          {hint && <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{hint}</span>}
        </span>
      </label>
    );
  }

  if (param.kind === 'select') {
    const selected = typeof value === 'string' || typeof value === 'number' ? String(value) : String(param.default ?? '');
    return (
      <label className="space-y-1 text-sm text-slate-100">
        <span>{label}</span>
        <select
          value={selected}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm"
        >
          {(param.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>{ruOptionLabel(option)}</option>
          ))}
        </select>
        {hint && <span className="block text-[11px] leading-4 text-slate-500">{hint}</span>}
      </label>
    );
  }

  if (param.kind === 'number') {
    return (
      <label className="space-y-1 text-sm text-slate-100">
        <span>{label}</span>
        <Input
          type="number"
          min={param.minimum}
          max={param.maximum}
          value={typeof value === 'number' || typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
          className="h-9 border-slate-700 bg-slate-900"
        />
        {hint && <span className="block text-[11px] leading-4 text-slate-500">{hint}</span>}
      </label>
    );
  }

  if (param.kind === 'source-list') {
    const items = sourceListValue(value);
    const mediaKind = param.mediaKind ?? 'image';
    const mediaLabel = mediaKind === 'image' ? 'изображение' : mediaKind === 'video' ? 'видео' : 'аудио';
    return (
      <div className="space-y-1.5 text-sm text-slate-100">
        <div className="flex items-center justify-between gap-2">
          <span>{label}</span>
          <InputSourcePicker
            mediaKind={mediaKind}
            value={null}
            compact
            onChange={(selected) => {
              if (!selected) return;
              onChange(param.multiple ? [...items, selected.ref] : selected.ref);
            }}
          />
        </div>
        {hint && <p className="text-[11px] leading-4 text-slate-500">{hint}</p>}
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
              <button
                key={item}
                type="button"
                title="Убрать"
                className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300 hover:border-rose-400 hover:text-rose-200"
                onClick={() => onChange(param.multiple ? items.filter((current) => current !== item) : undefined)}
              >
                <span className="max-w-[180px] truncate">{item}</span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-600">Не выбрано — нажмите «Прикрепить», чтобы добавить {mediaLabel}.</p>
        )}
      </div>
    );
  }

  const isLong = param.kind === 'textarea';
  return (
    <label className="space-y-1 text-sm text-slate-100">
      <span>{label}</span>
      {isLong ? (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          className="border-slate-700 bg-slate-900"
        />
      ) : (
        <Input
          value={typeof value === 'string' || typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 border-slate-700 bg-slate-900"
        />
      )}
      {hint && <span className="block text-[11px] leading-4 text-slate-500">{hint}</span>}
    </label>
  );
}
