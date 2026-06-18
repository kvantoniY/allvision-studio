'use client';

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageIcon,
  Info,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BlockCatalogItem, JsonSchemaObject, ModelOption, ModelPriceOverrides, PiAPIParamCapability, SourceMediaKind } from '@allvision/shared';
import {
  applyModelPriceOverride,
  formatMoney,
  formatAdminServiceValidationError,
  getPiAPIModelCapability,
  parseSourceSelectDescription,
  serviceMargin,
  summarizePipelinePricing,
  validatePipelineConfig,
  validateUserInputForm,
} from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  type AdminService,
  type PipelineStep,
  type ServiceCategory,
  type UserInputField,
  useCreateAdminServiceMutation,
  useGetAdminBlocksQuery,
  useTestRunAdminServiceMutation,
  useUpdateAdminServiceMutation,
} from '@/store/api/admin-services-api';
import {
  type AdminMediaAsset,
  useListAdminMediaAssetsQuery,
} from '@/store/api/admin-media-assets-api';
import { useGetAdminSettingsQuery, useUpdateAdminSettingsMutation } from '@/store/api/admin-settings-api';
import { useListAdminServiceCategoriesQuery } from '@/store/api/admin-service-categories-api';
import { useGetProjectStatusQuery } from '@/store/api/projects-api';
import { SourceSelector, type AvailableSourceStep } from './SourceSelector';

// Categories are now loaded dynamically from API (ServiceCategoryDef). Form fetches the list at render time.

const fieldTypeLabels: Record<UserInputField['type'], string> = {
  text: 'Текст',
  textarea: 'Большой текст',
  photo: 'Фото',
  video: 'Видео (загрузка юзером)',
  select: 'Список вариантов',
  'media-select': 'Выбор из медиа-библиотеки',
  avatar: 'Аватар из Студии',
  tier: 'Тариф качества (устар.)',
  audio: 'Аудио (mp3/wav)',
  duration: 'Длительность (секунды)',
  aspect_ratio: 'Формат кадра',
  'music-select': 'Музыка из библиотеки',
  slides: 'Слайды карусели',
  multiselect: 'Чекбоксы с ценами',
  checkbox: 'Галочка (да/нет)',
};

const fieldTypeHints: Partial<Record<UserInputField['type'], string>> = {
  text: 'Однострочное текстовое поле (например, имя ребёнка или короткая надпись).',
  textarea: 'Многострочное поле для длинного текста или пожеланий.',
  photo: 'Загрузка фото пользователем; можно разрешить выбор аватара из Студии.',
  video: 'Пользователь загружает своё видео. Лимиты по размеру (МБ) и длительности (сек) — для Seedance до 15 сек.',
  select: 'Выпадающий список с заранее заданными вариантами (вы задаёте их ниже).',
  'media-select': 'Пользователь выбирает готовый файл из медиа-библиотеки (например, тренд-видео).',
  avatar: 'Выбор аватара из личной Студии пользователя.',
  audio: 'Загрузка пользователем аудио-дорожки (mp3/wav и т.п.).',
  duration: 'Кнопки выбора длительности результата в секундах.',
  aspect_ratio: 'Кнопки выбора формата кадра (9:16, 16:9 и т.д.).',
  'music-select': 'Выбор фоновой музыки из медиа-библиотеки.',
  slides: 'Пользователь добавляет несколько текстов слайдов; итоговая цена может считаться за каждый слайд.',
  multiselect: 'Несколько чекбоксов. У каждого варианта можно задать отдельную цену в токенах.',
  checkbox: 'Одна галочка (вкл/выкл). Можно задать две цены услуги: без галочки и с галочкой (например, фото / фото + анимация). Условный шаг пайплайна запускается по этой галочке.',
};

type AdminServiceFormProps = {
  mode: 'create' | 'edit';
  service?: AdminService;
};

type FormDraft = {
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  category: ServiceCategory;
  priceCoinsStandard: number;
  priceCoinsPro: number;
  previewMode: 'auto' | 'image' | 'video';
  isActive: boolean;
  isFeatured: boolean;
  pipelineConfig: PipelineStep[];
  userInputForm: UserInputField[];
};

type ApiError = {
  data?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

type SortableFrameProps = {
  id: string;
  children: (handle: ReactNode) => ReactNode;
};

function defaultUserInputForm(): UserInputField[] {
  return [];
}

function normaliseCategory(category?: ServiceCategory | null): ServiceCategory {
  return category ?? '';
}

function normalisePipeline(value: AdminService['pipelineConfig'] | undefined): PipelineStep[] {
  if (!Array.isArray(value)) return [];
  return value.map((step) => ({
    id: step.id,
    blockSlug: step.blockSlug,
    input: step.input,
    params: isRecord(step.params) ? step.params : {},
    // Preserve conditional-step config so editing a service in admin does not drop it.
    ...(step.when ? { when: step.when } : {}),
  }));
}

function normaliseUserInputForm(value: AdminService['userInputForm'] | undefined): UserInputField[] {
  if (!Array.isArray(value) || value.length === 0) return defaultUserInputForm();
  // Keep at most one tier field (legacy compatibility). New services don't need tier; Pro is default.
  return value.filter((field, index) => field.type !== 'tier' || value.findIndex((item) => item.type === 'tier') === index);
}

function initialDraft(service?: AdminService): FormDraft {
  const pro = service?.priceCoinsPro ?? service?.priceCoinsStandard ?? service?.priceTokens ?? 200;
  return {
    slug: service?.slug ?? '',
    title: service?.title ?? '',
    shortDesc: service?.shortDesc ?? '',
    description: service?.description ?? '',
    category: normaliseCategory(service?.category),
    priceCoinsStandard: pro,
    priceCoinsPro: pro,
    previewMode: service?.previewMode ?? 'auto',
    isActive: service?.isActive ?? true,
    isFeatured: service?.isFeatured ?? false,
    pipelineConfig: normalisePipeline(service?.pipelineConfig),
    userInputForm: normaliseUserInputForm(service?.userInputForm),
  };
}

function apiErrorMessage(error: unknown) {
  const code = (error as ApiError)?.data?.error?.code;
  if (code === 'SERVICE_SLUG_TAKEN') return 'Слаг уже занят';
  if (code === 'SERVICE_IN_USE') return 'Услуга используется активным проектом';
  if (code === 'INVALID_BLOCK_PARAMS') return 'Параметры одного из блоков невалидны';
  if (code === 'INVALID_STEP_REFERENCE') return (error as ApiError)?.data?.error?.message ?? 'Пайплайн содержит ссылку на будущий или несуществующий шаг';
  if (code === 'TIER_FIELD_REQUIRED') return 'В форме должен быть ровно один tier-field';
  if (code === 'FILE_TOO_LARGE') return 'Файл слишком большой';
  if (code === 'UNSUPPORTED_FORMAT') return 'Формат файла не поддерживается';
  return (error as ApiError)?.data?.error?.message ?? 'Операция не выполнена';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items.filter((item) => item !== undefined && item !== null))];
}

function parseDurationOptionsInput(value: string): number[] {
  return unique(
    value
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((duration) => Number.isInteger(duration) && duration > 0 && duration <= 60),
  );
}

function syncDurationPrices(
  durations: number[],
  prices: UserInputField['durationPrices'],
): UserInputField['durationPrices'] {
  const next = durations
    .map((duration) => {
      const existing = prices?.find((item) => item.duration === duration);
      return existing && existing.priceCoins > 0 ? { duration, priceCoins: existing.priceCoins } : null;
    })
    .filter((item): item is { duration: number; priceCoins: number } => Boolean(item));
  return next.length > 0 ? next : undefined;
}

function setDurationPrice(
  field: UserInputField,
  duration: number,
  rawValue: string,
): UserInputField['durationPrices'] {
  const priceCoins = Number(rawValue);
  const current = field.durationPrices ?? [];
  const withoutCurrent = current.filter((item) => item.duration !== duration);
  if (!Number.isInteger(priceCoins) || priceCoins <= 0) return withoutCurrent.length > 0 ? withoutCurrent : undefined;
  return [...withoutCurrent, { duration, priceCoins }].sort((a, b) => a.duration - b.duration);
}

function durationPriceInputValue(field: UserInputField, duration: number) {
  return field.durationPrices?.find((item) => item.duration === duration)?.priceCoins ?? '';
}

function schemaObject(value: unknown): JsonSchemaObject {
  return isRecord(value) && typeof value.type === 'string' ? (value as JsonSchemaObject) : { type: 'string' };
}

function selectValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function coerceBySchema(value: string, schema: JsonSchemaObject) {
  if (schema.type === 'number') return value === '' ? undefined : Number(value);
  if (schema.type === 'boolean') return value === 'true';
  return value;
}

function isTierModelSchema(schema: JsonSchemaObject) {
  if (schema.type !== 'object' || !schema.properties) return false;
  return Boolean(schema.properties.standard && schema.properties.pro);
}

function preferredModel(models: ModelOption[], tier: 'standard' | 'pro') {
  const candidates = models.some((model) => model.provider !== 'mock')
    ? models.filter((model) => model.provider !== 'mock')
    : models;
  return (
    candidates.find((model) => model.tierHint === tier)?.slug ??
    candidates.find((model) => model.tierHint === 'both')?.slug ??
    candidates[0]?.slug ??
    ''
  );
}

function modelBySlug(models: ModelOption[], slug: unknown) {
  return typeof slug === 'string' ? models.find((model) => model.slug === slug) : undefined;
}

function minimumModelPriceCoins(model: ModelOption) {
  return Math.max(0, model.estimatedCostCoins ?? 0);
}

function effectiveModelPriceCoins(model: ModelOption, overrides?: ModelPriceOverrides) {
  return applyModelPriceOverride(model.slug, minimumModelPriceCoins(model), overrides);
}

function modelParamKey(value: string) {
  return value.split('=')[0].replace(/\[\]$/, '');
}

function modelSupportedParamKeys(model: ModelOption) {
  const capability = getPiAPIModelCapability(model.slug);
  return new Set([
    ...(model.requiredParams ?? []).map(modelParamKey),
    ...(model.optionalParams ?? []).map(modelParamKey),
    ...(capability?.duration ? ['duration'] : []),
    ...(capability?.aspectRatios?.length ? ['aspect_ratio'] : []),
    ...(capability?.resolutions?.length ? ['resolution'] : []),
    ...(capability?.mode ? ['mode'] : []),
    ...(capability?.params.map((param) => param.key) ?? []),
    ...(capability?.audio.booleanParam ? [capability.audio.booleanParam] : []),
    ...(capability?.audio.inputParam ? [capability.audio.inputParam] : []),
    ...(capability?.audio.preserveParam ? [capability.audio.preserveParam] : []),
  ]);
}

function capabilityParamMap(models: ModelOption[]) {
  const map = new Map<string, PiAPIParamCapability>();
  for (const model of models) {
    for (const param of getPiAPIModelCapability(model.slug)?.params ?? []) {
      if (!map.has(param.key)) map.set(param.key, param);
    }
  }
  return map;
}

function shouldShowParamForModels(block: BlockCatalogItem, key: string, schema: JsonSchemaObject, models: ModelOption[]) {
  if (key === 'model' || isTierModelSchema(schema)) return true;
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('prompt')) return true;
  if (block.slug === 'product-card' || block.slug === 'carousel-slides') return true;
  if (lowerKey.endsWith('_model')) return true;
  if (models.length === 0 || models.some((model) => model.provider !== 'piapi')) return true;
  const coreKeys = new Set(['prompt', 'duration', 'aspect_ratio', 'input_image', 'video_url', 'target_video', 'estimatedFrames', 'title', 'music']);
  if (coreKeys.has(key) || block.paramsSchema.required?.includes(key)) return true;
  return models.some((model) => modelSupportedParamKeys(model).has(key));
}

function schemaWithModelOptions(key: string, schema: JsonSchemaObject, models: ModelOption[], capabilityParam?: PiAPIParamCapability): JsonSchemaObject {
  const capabilities = models.map((model) => getPiAPIModelCapability(model.slug)).filter(Boolean);
  if (capabilityParam?.kind === 'select' && capabilityParam.options?.length) {
    return {
      ...schema,
      enum: capabilityParam.options.map((option) => option.value),
      default: capabilityParam.default ?? schema.default,
      title: schema.title ?? capabilityParam.title,
      description: schema.description ?? capabilityParam.description,
    };
  }
  if (key === 'resolution') {
    const values = unique(capabilities.flatMap((capability) => capability?.resolutions ?? []));
    if (values.length > 0) return { ...schema, enum: values, default: capabilities[0]?.defaultResolution ?? schema.default };
  }
  if (key === 'aspect_ratio') {
    const values = unique(capabilities.flatMap((capability) => capability?.aspectRatios ?? []));
    if (values.length > 0) return { ...schema, enum: values, default: values.includes('auto') ? 'auto' : values[0] };
  }
  if (key === 'mode') {
    const values = unique(capabilities.map((capability) => capability?.mode).filter((value): value is string => Boolean(value)));
    if (values.length > 0) return { ...schema, enum: values, default: values[0] };
  }
  if (key === 'duration') {
    const minimum = Math.max(...capabilities.map((capability) => capability?.duration?.minimum ?? schema.minimum ?? 1));
    const maximum = Math.min(...capabilities.map((capability) => capability?.duration?.maximum ?? schema.maximum ?? 30));
    return {
      ...schema,
      minimum: Number.isFinite(minimum) ? minimum : schema.minimum,
      maximum: Number.isFinite(maximum) ? maximum : schema.maximum,
      default: capabilities[0]?.duration?.default ?? schema.default,
    };
  }
  if (capabilityParam) {
    return {
      ...schema,
      title: schema.title ?? capabilityParam.title,
      description: schema.description ?? capabilityParam.description,
      minimum: capabilityParam.minimum ?? schema.minimum,
      maximum: capabilityParam.maximum ?? schema.maximum,
      default: capabilityParam.default ?? schema.default,
    };
  }
  return schema;
}

function providerLabel(provider: ModelOption['provider']) {
  if (provider === 'piapi') return 'PiAPI';
  if (provider === 'local') return 'Local';
  return 'Mock';
}

function HelpTip({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <details className="relative inline-block">
      <summary className="inline-flex cursor-pointer list-none items-center text-slate-500 hover:text-rose-200">
        <Info className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-md border border-zinc-700 bg-zinc-950 p-3 text-xs leading-relaxed text-slate-300 shadow-xl">
        {text}
      </div>
    </details>
  );
}

function FieldLabel({ children, help }: { children: ReactNode; help?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Label>{children}</Label>
      <HelpTip text={help} />
    </div>
  );
}

function fieldHelp(key: string, schema: JsonSchemaObject) {
  const lines = [
    schema.description ? `Что делает: ${schema.description}` : undefined,
    schema.enum?.length ? `Допустимые значения: ${schema.enum.map(String).join(', ')}` : undefined,
    schema.minimum !== undefined || schema.maximum !== undefined
      ? `Диапазон: ${schema.minimum ?? 'без минимума'}-${schema.maximum ?? 'без максимума'}`
      : undefined,
    schema.default !== undefined ? `По умолчанию: ${String(schema.default)}` : 'Если оставить пустым, будет применён дефолт блока или провайдера.',
    `Пример: ${exampleParamValue(key, schema)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function exampleParamValue(key: string, schema: JsonSchemaObject) {
  if (schema.enum?.length) return String(schema.enum[0]);
  if (key.toLowerCase().includes('prompt')) return 'A warm cinematic portrait, natural motion, soft light';
  if (key.toLowerCase().includes('image')) return '{{user_photo}}';
  if (key.toLowerCase().includes('video')) return '{{trend_video}}';
  if (schema.type === 'number') return String(schema.default ?? schema.minimum ?? 5);
  if (schema.type === 'boolean') return String(schema.default ?? false);
  return schema.default !== undefined ? String(schema.default) : 'auto';
}

function formatModelLimit(key: string, value: unknown) {
  const labels: Record<string, string> = {
    maxDurationSec: 'Макс. длительность',
    minDurationSec: 'Мин. длительность',
    maxResolution: 'Макс. разрешение',
    resolutions: 'Разрешения',
    aspectRatios: 'Aspect ratio',
    maxFileSize: 'Макс. размер файла',
  };
  const formatted = Array.isArray(value) ? value.join(', ') : String(value);
  return `${labels[key] ?? key}: ${formatted}`;
}

const blockCategoryNames: Record<string, string> = {
  image: 'Изображения',
  video: 'Видео',
  motion: 'Перенос движения',
  compose: 'Сборка / монтаж',
  audio: 'Аудио',
  text: 'Текст',
};

function blockCategoryLabel(block: BlockCatalogItem) {
  return blockCategoryNames[block.category] ?? block.category;
}

function groupBlocksByCategory(blocks: BlockCatalogItem[]): Array<[string, BlockCatalogItem[]]> {
  const groups = new Map<string, BlockCatalogItem[]>();
  for (const block of blocks) {
    const label = blockCategoryLabel(block);
    const list = groups.get(label) ?? [];
    list.push(block);
    groups.set(label, list);
  }
  return [...groups.entries()];
}

function defaultValueForSchema(schema: JsonSchemaObject, block: BlockCatalogItem, key?: string): unknown {
  if (key === 'model' || isTierModelSchema(schema)) {
    return {
      standard: preferredModel(block.supportedModels, 'standard'),
      pro: preferredModel(block.supportedModels, 'pro'),
    };
  }
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === 'object') {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([childKey, childSchema]) => [
        childKey,
        defaultValueForSchema(schemaObject(childSchema), block, childKey),
      ]),
    );
  }
  if (schema.type === 'number') return 0;
  if (schema.type === 'boolean') return false;
  return '';
}

function defaultParams(block: BlockCatalogItem): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(block.paramsSchema.properties ?? {}).map(([key, schema]) => [
      key,
      defaultValueForSchema(schemaObject(schema), block, key),
    ]),
  );
}

function buildStepId(steps: PipelineStep[]) {
  let next = steps.length + 1;
  let id = `step_${next}`;
  const used = new Set(steps.map((step) => step.id));
  while (used.has(id)) {
    next += 1;
    id = `step_${next}`;
  }
  return id;
}

function blockBySlug(blocks: BlockCatalogItem[] | undefined, slug: string) {
  return blocks?.find((block) => block.slug === slug);
}

function blockOutputKind(block: BlockCatalogItem | undefined): SourceMediaKind | undefined {
  if (!block) return undefined;
  if (block.category === 'image') return 'image';
  if (block.category === 'video' || block.category === 'motion' || block.category === 'compose') return 'video';
  return undefined;
}

function blockInputKind(block: BlockCatalogItem | undefined): SourceMediaKind {
  if (!block) return 'image';
  if (block.slug === 'video-compose') return 'video';
  return 'image';
}

function availableSourceSteps(
  steps: PipelineStep[],
  blocks: BlockCatalogItem[] | undefined,
  index: number,
): AvailableSourceStep[] {
  return steps.slice(0, index).map((step, current) => {
    const block = blockBySlug(blocks, step.blockSlug);
    return {
      id: step.id,
      title: `Шаг ${current + 1}: ${block?.title ?? step.blockSlug}`,
      outputKind: blockOutputKind(block),
    };
  });
}

function canonicaliseParamsForBlock(blockSlug: string, params: unknown): Record<string, unknown> {
  const record = isRecord(params) ? { ...params } : {};
  if (blockSlug === 'motion-transfer') {
    if (record.video_url === undefined && record.driving_video !== undefined) {
      record.video_url = record.driving_video;
    }
    delete record.driving_video;
  }
  return record;
}

function canonicalisePipelineConfig(steps: PipelineStep[]) {
  return steps.map((step) => ({
    ...step,
    params: canonicaliseParamsForBlock(step.blockSlug, step.params),
  }));
}

function pipelineSentence(steps: PipelineStep[], blocks: BlockCatalogItem[] | undefined) {
  if (steps.length === 0) return 'Пайплайн пустой';
  return steps
    .map((step) => blockBySlug(blocks, step.blockSlug)?.title ?? step.blockSlug)
    .join(' → ');
}

function marginTone(marginPercent: number | null) {
  if (marginPercent === null) return 'border-zinc-800 bg-zinc-950 text-slate-300';
  if (marginPercent < 0) return 'border-red-800 bg-red-950/40 text-red-100';
  if (marginPercent < 50) return 'border-amber-800 bg-amber-950/30 text-amber-100';
  return 'border-emerald-800 bg-emerald-950/30 text-emerald-100';
}

function validationErrors(steps: PipelineStep[], fields: UserInputField[]) {
  const errors: string[] = [];
  try {
    validateUserInputForm(fields);
  } catch (err) {
    errors.push(formatAdminServiceValidationError((err as Error).message));
  }
  try {
    validatePipelineConfig(steps, fields);
  } catch (err) {
    errors.push(formatAdminServiceValidationError((err as Error).message));
  }
  return [...new Set(errors)];
}

function fileName(file: File | null) {
  if (!file) return null;
  return `${file.name} (${Math.round(file.size / 1024)} KB)`;
}

function PreviewAssetPicker({
  assets,
  isLoading,
  selectedUrl,
  onSelect,
}: {
  assets: AdminMediaAsset[];
  isLoading?: boolean;
  selectedUrl?: string | null;
  onSelect: (asset: AdminMediaAsset) => void;
}) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950 p-2">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Медиа-библиотека</div>
      {isLoading ? (
        <div className="py-4 text-center text-xs text-slate-500">Загружаю медиа...</div>
      ) : assets.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-500">Нет подходящих файлов</div>
      ) : (
        <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
          {assets.map((asset) => {
            const selected = selectedUrl === asset.publicUrl;
            return (
              <button
                key={asset.id}
                type="button"
                onClick={() => onSelect(asset)}
                className={cn(
                  'grid grid-cols-[56px_1fr] gap-2 rounded-md border bg-zinc-900 p-1.5 text-left transition hover:border-violet-400',
                  selected ? 'border-violet-400 ring-1 ring-violet-400/40' : 'border-zinc-800',
                )}
              >
                <div className="h-14 overflow-hidden rounded bg-black">
                  {asset.mimeType.startsWith('video/') ? (
                    <video src={asset.publicUrl} className="h-full w-full object-cover" muted preload="metadata" />
                  ) : (
                    <img src={asset.publicUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 self-center">
                  <div className="truncate text-xs font-semibold text-slate-100">{asset.title}</div>
                  <div className="mt-1 truncate text-[11px] text-slate-500">{asset.kind}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function buildMockUserInputs(fields: UserInputField[] | null | undefined) {
  const source = normaliseUserInputForm(fields);
  return Object.fromEntries(
    source.map((field) => {
      if (field.type === 'photo') return [field.id, 'mock://admin-test/photo.jpg'];
      if (field.type === 'avatar') return [field.id, 'mock-avatar-admin'];
      if (field.type === 'select') return [field.id, field.options?.[0]?.value ?? 'mock-option'];
      if (field.type === 'multiselect') {
        const picked = (field.options ?? [])
          .filter((option) => option.disabled !== true)
          .slice(0, 1)
          .map((option) => option.value);
        return [field.id, picked.length ? picked : ['option_1']];
      }
      if (field.type === 'slides') {
        return [field.id, [
          { text: 'Слайд 1', withPhoto: true },
          { text: 'Слайд 2', withPhoto: true },
          { text: 'Слайд 3', withPhoto: false },
        ]];
      }
      if (field.type === 'checkbox') return [field.id, field.defaultChecked === true];
      if (field.type === 'tier') return [field.id, 'standard'];
      if (field.type === 'duration') return [field.id, String(field.defaultDuration ?? field.durationOptions?.[0] ?? 5)];
      return [field.id, field.placeholder || field.label || 'Test value'];
    }),
  );
}

function outputUrl(output: unknown) {
  if (!isRecord(output)) return null;
  if (typeof output.url === 'string') return output.url;
  if (typeof output.resultVideo === 'string') return output.resultVideo;
  if (typeof output.resultImage === 'string') return output.resultImage;
  if (typeof output.resultThumbnail === 'string') return output.resultThumbnail;
  return null;
}

function SortableFrame({ id, children }: SortableFrameProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const handle = (
    <button
      type="button"
      className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-700 text-slate-400 hover:border-rose-400 hover:text-white"
      aria-label="Перетащить"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && 'relative z-10 opacity-80')}>
      {children(handle)}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-800 pt-6">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function sourceListValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  return [];
}

function SourceListParamField({
  param,
  value,
  onChange,
  userInputFields,
  availableSteps,
}: {
  param: PiAPIParamCapability;
  value: unknown;
  onChange: (value: unknown) => void;
  userInputFields: UserInputField[];
  availableSteps: AvailableSourceStep[];
}) {
  const mediaKind = (param.mediaKind ?? 'image') as SourceMediaKind;
  if (!param.multiple) {
    return (
      <div className="md:col-span-2">
        <SourceSelector
          value={selectValue(value)}
          onChange={onChange}
          mediaKind={mediaKind}
          userInputFields={userInputFields}
          availableSteps={availableSteps}
          label={param.title}
          description={param.description}
        />
      </div>
    );
  }

  const items = sourceListValues(value);
  return (
    <div className="space-y-2 md:col-span-2">
      <FieldLabel help={param.description}>{param.title}</FieldLabel>
      <div className="grid gap-2 md:grid-cols-[1fr_220px]">
        <Input
          value={items.join(', ')}
          onChange={(event) => onChange(sourceListValues(event.target.value))}
          placeholder="{{user.photo}}, {{step_1.output}}, asset:id or URL"
        />
        <SourceSelector
          value=""
          onChange={(next) => onChange([...items, next])}
          mediaKind={mediaKind}
          userInputFields={userInputFields}
          availableSteps={availableSteps}
          label=""
        />
      </div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <button
              key={item}
              type="button"
              className="max-w-[260px] truncate rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-slate-300"
              onClick={() => onChange(items.filter((current) => current !== item))}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelPriceEditor({
  model,
  usdToRub,
  overrides,
  onSave,
  disabled,
}: {
  model: ModelOption;
  usdToRub: number;
  overrides?: ModelPriceOverrides;
  onSave: (slug: string, priceCoins: number) => Promise<void>;
  disabled?: boolean;
}) {
  const cost = minimumModelPriceCoins(model);
  const floor = cost > 0 ? 1 : 0;
  const effective = effectiveModelPriceCoins(model, overrides);
  const [draft, setDraft] = useState(String(effective));

  useEffect(() => {
    setDraft(String(effective));
  }, [effective]);

  const parsed = Number(draft);
  const nextPrice = Number.isFinite(parsed) ? Math.max(floor, Math.ceil(parsed)) : floor;
  const changed = nextPrice !== effective;

  return (
    <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1 space-y-1">
          <Label htmlFor={`model-price-${model.slug}`}>Цена генерации, токены</Label>
          <Input
            id={`model-price-${model.slug}`}
            type="number"
            min={floor}
            step={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => setDraft(String(nextPrice))}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || !changed}
          onClick={() => onSave(model.slug, nextPrice)}
        >
          Сохранить цену
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled || effective === cost}
          onClick={() => onSave(model.slug, cost)}
        >
          Сбросить
        </Button>
      </div>
      <div className="mt-2 text-xs text-slate-500">
        Расчётная себестоимость {formatMoney({ coins: cost }, { primary: 'coins', showAll: true, usdToRub })}
        {model.estimatedCostUsd ? ` · себестоимость ${formatMoney({ usd: model.estimatedCostUsd }, { primary: 'usd', showAll: true, usdToRub })}` : ''}
      </div>
    </div>
  );
}

function BlockParamsForm({
  block,
  value,
  onChange,
  usdToRub,
  modelPriceOverrides,
  onModelPriceChange,
  modelPriceSaving,
  userInputFields,
  availableSteps,
}: {
  block: BlockCatalogItem;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  usdToRub: number;
  modelPriceOverrides?: ModelPriceOverrides;
  onModelPriceChange: (slug: string, priceCoins: number) => Promise<void>;
  modelPriceSaving?: boolean;
  userInputFields: UserInputField[];
  availableSteps: AvailableSourceStep[];
}) {
  const update = (key: string, next: unknown) => onChange(canonicaliseParamsForBlock(block.slug, { ...value, [key]: next }));
  const modelValue = value.model;
  const standardModel = modelBySlug(
    block.supportedModels,
    isRecord(modelValue) ? modelValue.standard : modelValue,
  ) ?? block.supportedModels[0];
  const proModel = modelBySlug(
    block.supportedModels,
    isRecord(modelValue) ? modelValue.pro : modelValue,
  ) ?? standardModel;
  const selectedModels = [standardModel, proModel]
    .filter((model): model is ModelOption => Boolean(model))
    .filter((model, index, list) => list.findIndex((item) => item.slug === model.slug) === index);
  const duration = typeof value.duration === 'number' ? value.duration : undefined;
  const limitWarnings = selectedModels
    .flatMap((model) => {
      const maxDuration = model.limits?.maxDurationSec;
      if (duration && maxDuration && duration > maxDuration) {
        return [`Длительность превышает лимит ${model.title} (${maxDuration} с). PiAPI может вернуть ошибку.`];
      }
      return [];
    });
  const capabilityParams = capabilityParamMap(selectedModels);
  const paramEntries = Object.entries(block.paramsSchema.properties ?? {})
    .filter(([key, rawSchema]) => shouldShowParamForModels(block, key, schemaObject(rawSchema), selectedModels));

  return (
    <div className="space-y-4">
      <details className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm">
        <summary className="cursor-pointer font-semibold text-white">Описание блока</summary>
        <div className="mt-3 space-y-2 text-sm text-slate-300">
          <p>{block.description}</p>
          {block.useWhen && <p><span className="text-slate-500">Когда использовать:</span> {block.useWhen}</p>}
          <p><span className="text-slate-500">Категория:</span> {blockCategoryLabel(block)}</p>
          {block.compatibleInputs?.length ? <p><span className="text-slate-500">Совместимые входы:</span> {block.compatibleInputs.join(', ')}</p> : null}
          {block.examples?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-slate-400">
              {block.examples.map((example) => <li key={example}>{example}</li>)}
            </ul>
          ) : null}
        </div>
      </details>
      {selectedModels.length > 0 && (
        <details className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-xs text-slate-300" open>
          <summary className="cursor-pointer font-semibold text-white">Что делает эта модель</summary>
          {selectedModels.map((model) => (
            <div key={model.slug} className="mt-3 rounded-md border border-zinc-800 bg-zinc-950 p-3">
              <div className="font-medium text-slate-100">
                {model.title} · {providerLabel(model.provider)} · цена {formatMoney({ coins: effectiveModelPriceCoins(model, modelPriceOverrides) }, { primary: 'coins', showAll: true, usdToRub })}
                {model.estimatedCostUsd ? ` · ${formatMoney({ usd: model.estimatedCostUsd }, { primary: 'usd', showAll: true, usdToRub })}` : ''}
              </div>
              {model.description && <p className="mt-2 text-slate-400">{model.description}</p>}
              <ModelPriceEditor
                model={model}
                usdToRub={usdToRub}
                overrides={modelPriceOverrides}
                onSave={onModelPriceChange}
                disabled={modelPriceSaving}
              />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {model.limits && (
                  <div>
                    <div className="font-medium text-slate-200">Ограничения</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-500">
                      {Object.entries(model.limits).map(([key, item]) => (
                        <li key={key}>{formatModelLimit(key, item)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <div className="font-medium text-slate-200">Параметры</div>
                  {model.requiredParams?.length ? (
                    <div className="mt-1 text-slate-500">Обязательные: {model.requiredParams.join(', ')}</div>
                  ) : (
                    <div className="mt-1 text-slate-500">Обязательные: нет сверх схемы блока</div>
                  )}
                  {model.optionalParams?.length ? (
                    <div className="text-slate-500">Опциональные: {model.optionalParams.join(', ')}</div>
                  ) : null}
                  {model.providerModel && <div className="mt-1 text-slate-500">Модель провайдера: {model.providerModel}</div>}
                  {model.taskType && <div className="text-slate-500">Тип задачи: {model.taskType}</div>}
                </div>
              </div>
              {model.docsUrl && <a href={model.docsUrl} target="_blank" className="mt-3 inline-block text-rose-300 hover:text-rose-200">Документация</a>}
            </div>
          ))}
          {limitWarnings.map((warning) => <div key={warning} className="mt-2 text-amber-300">{warning}</div>)}
        </details>
      )}
      <div className="grid gap-4 md:grid-cols-2">
      {paramEntries.map(([key, rawSchema]) => {
        const capabilityParam = capabilityParams.get(key);
        const schema = schemaWithModelOptions(key, schemaObject(rawSchema), selectedModels, capabilityParam);
        const sourceMeta = parseSourceSelectDescription(schema.description);
        const label = sourceMeta?.label ?? schema.title ?? key;
        const description = sourceMeta?.description ?? schema.description;
        const fieldValue = value[key] ?? schema.default;

        if (key === 'model' || isTierModelSchema(schema)) {
          // Single-tier: Pro is the only tier shipped. Mirror selection into { standard, pro } for backend compat.
          const current = fieldValue;
          let modelSlug = '';
          if (typeof current === 'string') modelSlug = current;
          else if (isRecord(current) && typeof current.pro === 'string') modelSlug = current.pro;
          else if (isRecord(current) && typeof current.standard === 'string') modelSlug = current.standard;
          if (!modelSlug) modelSlug = preferredModel(block.supportedModels, 'pro');
          return (
            <div key={key} className="md:col-span-2">
              <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
              <select
                value={modelSlug}
                onChange={(event) => update(key, { standard: event.target.value, pro: event.target.value })}
                className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
              >
                {block.supportedModels.map((model) => (
                  <option key={model.slug} value={model.slug}>
                    {model.title} · {effectiveModelPriceCoins(model, modelPriceOverrides)} коинов
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (capabilityParam?.kind === 'source-list' && capabilityParam.mediaKind) {
          return (
            <SourceListParamField
              key={key}
              param={capabilityParam}
              value={value[key]}
              onChange={(next) => update(key, next)}
              userInputFields={userInputFields}
              availableSteps={availableSteps}
            />
          );
        }

        if (sourceMeta) {
          const sourceValue =
            block.slug === 'motion-transfer' && key === 'video_url' && fieldValue === undefined
              ? selectValue(value.driving_video)
              : selectValue(fieldValue);
          return (
            <div key={key} className="md:col-span-2">
              <SourceSelector
                value={sourceValue}
                onChange={(next) => update(key, next)}
                mediaKind={sourceMeta.mediaKind}
                userInputFields={userInputFields}
                availableSteps={availableSteps}
                label={label}
                description={description}
              />
            </div>
          );
        }

        if (schema.enum?.length) {
          return (
            <div key={key} className="space-y-2">
              <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
              <select
                value={selectValue(fieldValue)}
                onChange={(event) => update(key, coerceBySchema(event.target.value, schema))}
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
              >
                {schema.enum.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
              {description && <p className="text-xs text-slate-500">{description}</p>}
            </div>
          );
        }

        if (schema.type === 'boolean') {
          return (
            <label key={key} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(fieldValue)}
                onChange={(event) => update(key, event.target.checked)}
                className="h-4 w-4"
              />
              {label}
              <HelpTip text={fieldHelp(key, schema)} />
              {description && <span className="text-xs text-slate-500">{description}</span>}
            </label>
          );
        }

        if (schema.type === 'number') {
          return (
            <div key={key} className="space-y-2">
              <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
              <Input
                type="number"
                value={selectValue(fieldValue)}
                onChange={(event) => update(key, event.target.value === '' ? undefined : Number(event.target.value))}
              />
              {description && <p className="text-xs text-slate-500">{description}</p>}
            </div>
          );
        }

        const isPrompt = key.toLowerCase().includes('prompt') || key.toLowerCase().includes('music');
        return (
          <div key={key} className={cn('space-y-2', isPrompt && 'md:col-span-2')}>
            <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
            {isPrompt ? (
              <Textarea value={selectValue(fieldValue)} rows={3} onChange={(event) => update(key, event.target.value)} />
            ) : (
              <Input value={selectValue(fieldValue)} onChange={(event) => update(key, event.target.value)} />
            )}
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function PipelineBuilder({
  steps,
  fields,
  blocks,
  onChange,
  usdToRub,
  modelPriceOverrides,
  onModelPriceChange,
  modelPriceSaving,
}: {
  steps: PipelineStep[];
  fields: UserInputField[];
  blocks: BlockCatalogItem[] | undefined;
  onChange: (steps: PipelineStep[]) => void;
  usdToRub: number;
  modelPriceOverrides?: ModelPriceOverrides;
  onModelPriceChange: (slug: string, priceCoins: number) => Promise<void>;
  modelPriceSaving?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const errors = useMemo(() => validationErrors(steps, fields), [steps, fields]);

  const addStep = (slug: string) => {
    const block = blockBySlug(blocks, slug);
    if (!block) return;
    const previous = steps[steps.length - 1];
    const previousBlock = previous ? blockBySlug(blocks, previous.blockSlug) : undefined;
    const inputKind = blockInputKind(block);
    const defaultInput =
      previous && blockOutputKind(previousBlock) === inputKind
        ? `{{${previous.id}.output}}`
        : inputKind === 'video'
          ? '{{user.trendVideo}}'
          : '{{user.photo}}';
    const id = buildStepId(steps);
    const nextStep: PipelineStep = {
      id,
      blockSlug: block.slug,
      input: defaultInput,
      params: defaultParams(block),
    };
    onChange([...steps, nextStep]);
    setExpanded((state) => ({ ...state, [id]: true }));
  };

  const updateStep = (index: number, patch: Partial<PipelineStep>) => {
    onChange(steps.map((step, current) => (current === index ? { ...step, ...patch } : step)));
  };

  const removeStep = (index: number) => {
    if (!window.confirm('Удалить шаг pipeline?')) return;
    onChange(steps.filter((_step, current) => current !== index));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = steps.findIndex((step) => step.id === event.active.id);
    const to = steps.findIndex((step) => step.id === event.over?.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(steps, from, to));
  };

  return (
    <div className="space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {steps.map((step, index) => {
              const block = blockBySlug(blocks, step.blockSlug);
              const params = isRecord(step.params) ? step.params : {};
              const isExpanded = expanded[step.id] ?? true;
              const sourceSteps = availableSourceSteps(steps, blocks, index);
              return (
                <SortableFrame key={step.id} id={step.id}>
                  {(handle) => (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex gap-3">
                        {handle}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                Шаг {index + 1}: {block?.title ?? step.blockSlug}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{step.id}</div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                onClick={() => setExpanded((state) => ({ ...state, [step.id]: !isExpanded }))}
                                aria-label={isExpanded ? 'Свернуть' : 'Развернуть'}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                              <Button type="button" variant="destructive" size="icon" onClick={() => removeStep(index)} aria-label="Удалить шаг">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-4 space-y-4">
                              <div className="grid gap-4 md:grid-cols-[200px_1fr]">
                                <div className="space-y-2">
                                  <Label>Блок</Label>
                                  <select
                                    value={step.blockSlug}
                                    onChange={(event) => {
                                      const nextBlock = blockBySlug(blocks, event.target.value);
                                      updateStep(index, {
                                        blockSlug: event.target.value,
                                        params: nextBlock ? defaultParams(nextBlock) : {},
                                      });
                                    }}
                                    className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
                                  >
                                    {groupBlocksByCategory(blocks ?? []).map(([label, items]) => (
                                      <optgroup key={label} label={label}>
                                        {items.map((item) => (
                                          <option key={item.slug} value={item.slug}>
                                            {item.title}
                                          </option>
                                        ))}
                                      </optgroup>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <SourceSelector
                                    value={selectValue(step.input)}
                                    onChange={(input) => updateStep(index, { input })}
                                    mediaKind={blockInputKind(block)}
                                    userInputFields={fields}
                                    availableSteps={sourceSteps}
                                    label="Вход"
                                    description={
                                      step.blockSlug === 'image-edit'
                                        ? 'Основное изображение шага: оно автоматически уходит в модель ПЕРВЫМ референсом. Поле «Дополнительные референсы» ниже — только для вторых и последующих картинок, дублировать вход там не нужно.'
                                        : step.blockSlug === 'text-to-video'
                                          ? 'Для omni-моделей (Seedance Omni, Kling 3.0 Omni) вход автоматически уходит ПЕРВЫМ референсом — в промпте это @image1. Дублировать его в «Image references» не нужно. Чисто текстовые модели (Veo, Sora, Hailuo, Wan) вход игнорируют.'
                                          : 'Основной файл, который получает этот шаг. Можно выбрать поле пользователя, результат предыдущего шага, файл из библиотеки или ручной placeholder.'
                                    }
                                  />
                                </div>
                              </div>
                              {block ? (
                                <BlockParamsForm
                                  block={block}
                                  value={params}
                                  onChange={(value) => updateStep(index, { params: value })}
                                  usdToRub={usdToRub}
                                  modelPriceOverrides={modelPriceOverrides}
                                  onModelPriceChange={onModelPriceChange}
                                  modelPriceSaving={modelPriceSaving}
                                  userInputFields={fields}
                                  availableSteps={sourceSteps}
                                />
                              ) : (
                                <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
                                  Неизвестный блок
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </SortableFrame>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-zinc-700 bg-zinc-950/60 p-3">
        <Plus className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-300">Добавить шаг pipeline:</span>
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) addStep(event.target.value);
            event.target.value = '';
          }}
          className="h-10 min-w-[260px] flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 md:flex-none"
        >
          <option value="">Выберите блок…</option>
          {groupBlocksByCategory(blocks ?? []).map(([label, items]) => (
            <optgroup key={label} label={label}>
              {items.map((block) => (
                <option key={block.slug} value={block.slug}>
                  {block.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className={cn('rounded-md border p-3 text-sm', errors.length ? 'border-red-900/60 bg-red-950/30 text-red-200' : 'border-emerald-900/50 bg-emerald-950/20 text-emerald-200')}>
        <div className="flex items-center gap-2 font-medium">
          {errors.length ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {errors.length ? 'Пайплайн содержит ошибки' : 'Пайплайн валиден'}
        </div>
        {errors.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function UserInputFormBuilder({
  fields,
  onChange,
  servicePreview,
}: {
  fields: UserInputField[];
  onChange: (fields: UserInputField[]) => void;
  servicePreview?: { title: string; shortDesc: string; priceCoins: number; imageUrl: string | null };
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const [mediaGroups, setMediaGroups] = useState<string[]>([]);
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? '';
    fetch(`${base}/api/admin/media-assets/groups`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { groups: [] }))
      .then((json: { groups?: string[] }) => setMediaGroups(Array.isArray(json.groups) ? json.groups : []))
      .catch(() => undefined);
  }, []);

  const updateField = (index: number, patch: Partial<UserInputField>) => {
    onChange(fields.map((field, current) => (current === index ? { ...field, ...patch } : field)));
  };

  const addField = (type: UserInputField['type']) => {
    if (type === 'tier' && fields.some((field) => field.type === 'tier')) return;
    const idBase = type === 'photo' ? 'photo' : type;
    let suffix = 1;
    let id = idBase;
    const used = new Set(fields.map((field) => field.id));
    while (used.has(id)) {
      suffix += 1;
      id = `${idBase}_${suffix}`;
    }
    const next: UserInputField = {
      id,
      type,
      label: fieldTypeLabels[type],
      required: type === 'tier' || type === 'photo' || type === 'video',
      ...(type === 'video' ? { maxSizeMb: 50, maxDurationSec: 15, allowedFormats: ['mp4', 'webm', 'mov'], allowUserUpload: true } : {}),
      ...(type === 'media-select' ? { mediaKind: 'trend-video' } : {}),
      ...(type === 'music-select' ? { mediaKind: 'background-music', allowUserUpload: false, allowLibrary: true } : {}),
      ...(type === 'audio' ? { maxSizeMb: 25, allowedFormats: ['mp3', 'wav', 'ogg', 'm4a'], allowUserUpload: true, allowLibrary: false } : {}),
      ...(type === 'duration' ? { durationOptions: [5, 8, 10], defaultDuration: 5 } : {}),
      ...(type === 'aspect_ratio' ? { aspectOptions: ['auto', '9:16', '16:9', '1:1'], defaultAspect: 'auto' } : {}),
      ...(type === 'select' ? { options: [{ label: 'Вариант 1', value: 'option_1' }] } : {}),
      ...(type === 'multiselect' ? { options: [{ label: 'Вариант 1', value: 'option_1', priceCoins: 1 }] } : {}),
      ...(type === 'slides' ? { maxSlides: 10, maxLength: 600 } : {}),
      ...(type === 'checkbox' ? { defaultChecked: false } : {}),
      ...(type === 'photo'
        ? { maxSizeMb: 20, allowedFormats: ['jpg', 'jpeg', 'png'], allowStudioAvatars: true, allowSystemLibrary: false }
        : {}),
    };
    onChange([...fields, next]);
  };

  const removeField = (index: number) => {
    const field = fields[index];
    if (field.type === 'tier') return;
    if (!window.confirm('Удалить поле формы?')) return;
    onChange(fields.filter((_field, current) => current !== index));
  };

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const from = fields.findIndex((field) => field.id === event.active.id);
    const to = fields.findIndex((field) => field.id === event.over?.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(fields, from, to));
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <datalist id="admin-media-groups">
        {mediaGroups.map((group) => (
          <option key={group} value={group} />
        ))}
      </datalist>
      <div className="space-y-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {fields.map((field, index) => (
                <SortableFrame key={field.id} id={field.id}>
                  {(handle) => (
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                      <div className="flex gap-3">
                        {handle}
                        <div className="min-w-0 flex-1 space-y-4">
                          <div className="flex flex-wrap justify-between gap-3">
                            <div>
                              <div className="font-medium text-white">{field.label || field.id}</div>
                              <div className="mt-1 text-xs text-slate-500">{field.id} · {field.type}</div>
                            </div>
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              onClick={() => removeField(index)}
                              disabled={field.type === 'tier'}
                              aria-label="Удалить поле"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-3">
                            <div className="space-y-2">
                              <FieldLabel help="Технический идентификатор поля. В pipeline ссылка на него — {{user.ID}}.">ID поля</FieldLabel>
                              <Input value={field.id} onChange={(event) => updateField(index, { id: event.target.value })} disabled={field.type === 'tier'} className="font-mono" />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel help="Тип поля определяет, что и как вводит пользователь на странице услуги.">Тип поля</FieldLabel>
                              <select
                                value={field.type}
                                onChange={(event) => updateField(index, { type: event.target.value as UserInputField['type'] })}
                                disabled={field.type === 'tier'}
                                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
                              >
                                {Object.entries(fieldTypeLabels)
                                  .filter(([type]) => type !== 'tier' || field.type === 'tier')
                                  .map(([type, label]) => (
                                    <option key={type} value={type}>
                                      {label}
                                    </option>
                                  ))}
                              </select>
                              {fieldTypeHints[field.type] && (
                                <p className="text-xs leading-5 text-slate-500">{fieldTypeHints[field.type]}</p>
                              )}
                            </div>
                            <div className="space-y-2">
                              <FieldLabel help="Заголовок поля, который пользователь видит на странице услуги.">Подпись для пользователя</FieldLabel>
                              <Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} />
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <FieldLabel help="Поясняющий текст под полем (необязательно).">Подсказка под полем</FieldLabel>
                              <Input value={field.hint ?? ''} onChange={(event) => updateField(index, { hint: event.target.value || undefined })} />
                            </div>
                            <div className="space-y-2">
                              <FieldLabel help="Серый текст внутри пустого поля (placeholder).">Текст внутри поля</FieldLabel>
                              <Input value={field.placeholder ?? ''} onChange={(event) => updateField(index, { placeholder: event.target.value || undefined })} />
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(event) => updateField(index, { required: event.target.checked })}
                                disabled={field.type === 'tier'}
                              />
                              Обязательное
                            </label>
                            {(field.type === 'text' || field.type === 'textarea') && (
                              <label className="flex items-center gap-2">
                                Макс. длина
                                <Input
                                  type="number"
                                  min={1}
                                  value={field.maxLength ?? ''}
                                  onChange={(event) => updateField(index, { maxLength: event.target.value ? Number(event.target.value) : undefined })}
                                  className="h-8 w-24"
                                />
                              </label>
                            )}
                            {field.type === 'photo' && (
                              <label className="flex items-center gap-2">
                                Макс. размер, МБ
                                <Input
                                  type="number"
                                  min={1}
                                  value={field.maxSizeMb ?? ''}
                                  onChange={(event) => updateField(index, { maxSizeMb: event.target.value ? Number(event.target.value) : undefined })}
                                  className="h-8 w-24"
                                />
                              </label>
                            )}
                            {field.type === 'video' && (
                              <>
                                <label className="flex items-center gap-2">
                                  Макс. размер, МБ
                                  <Input
                                    type="number"
                                    min={1}
                                    value={field.maxSizeMb ?? ''}
                                    onChange={(event) => updateField(index, { maxSizeMb: event.target.value ? Number(event.target.value) : undefined })}
                                    className="h-8 w-24"
                                  />
                                </label>
                                <label className="flex items-center gap-2">
                                  Макс. длительность, сек
                                  <Input
                                    type="number"
                                    min={1}
                                    max={60}
                                    value={field.maxDurationSec ?? ''}
                                    onChange={(event) => updateField(index, { maxDurationSec: event.target.value ? Number(event.target.value) : undefined })}
                                    className="h-8 w-24"
                                  />
                                </label>
                              </>
                            )}
                            {field.type === 'photo' && (
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={field.allowStudioAvatars !== false}
                                  onChange={(event) => updateField(index, { allowStudioAvatars: event.target.checked })}
                                />
                                Разрешить выбор из Студии
                              </label>
                            )}
                            {field.type === 'photo' && (
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={field.allowSystemLibrary === true}
                                  onChange={(event) => updateField(index, { allowSystemLibrary: event.target.checked })}
                                />
                                Разрешить системную библиотеку
                              </label>
                            )}
                            {field.type === 'media-select' && (
                              <>
                                <label className="flex items-center gap-2">
                                  Вид медиа (kind)
                                  <Input
                                    value={field.mediaKind ?? ''}
                                    onChange={(event) => updateField(index, { mediaKind: event.target.value || undefined })}
                                    className="h-8 w-40"
                                  />
                                </label>
                                <label className="flex items-center gap-2">
                                  <span title="Пусто — юзер выбирает из всех медиа этого вида. Указана группа — только из неё.">Группа (пусто = все)</span>
                                  <Input
                                    list="admin-media-groups"
                                    value={field.mediaGroup ?? ''}
                                    onChange={(event) => updateField(index, { mediaGroup: event.target.value || undefined })}
                                    placeholder="все"
                                    className="h-8 w-44"
                                  />
                                </label>
                              </>
                            )}
                            {field.type === 'music-select' && (
                              <label className="flex items-center gap-2">
                                Вид медиа (kind)
                                <Input
                                  value={field.mediaKind ?? 'background-music'}
                                  onChange={(event) => updateField(index, { mediaKind: event.target.value || undefined })}
                                  className="h-8 w-44"
                                />
                              </label>
                            )}
                            {field.type === 'audio' && (
                              <>
                                <label className="flex items-center gap-2">
                                  Макс. размер, МБ
                                  <Input
                                    type="number"
                                    min={1}
                                    value={field.maxSizeMb ?? ''}
                                    onChange={(event) => updateField(index, { maxSizeMb: event.target.value ? Number(event.target.value) : undefined })}
                                    className="h-8 w-24"
                                  />
                                </label>
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={field.allowLibrary === true}
                                    onChange={(event) => updateField(index, { allowLibrary: event.target.checked })}
                                  />
                                  Добавить выбор из библиотеки
                                </label>
                              </>
                            )}
                            {field.type === 'duration' && (
                              <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
                                <div className="flex flex-wrap items-center gap-3">
                                  <label className="flex items-center gap-2">
                                    Опции (через запятую)
                                    <Input
                                      value={(field.durationOptions ?? [5, 8, 10]).join(',')}
                                      onChange={(event) => {
                                        const parts = parseDurationOptionsInput(event.target.value);
                                        updateField(index, {
                                          durationOptions: parts.length > 0 ? parts : undefined,
                                          defaultDuration: parts.length > 0 && (!field.defaultDuration || !parts.includes(field.defaultDuration))
                                            ? parts[0]
                                            : field.defaultDuration,
                                          durationPrices: syncDurationPrices(parts, field.durationPrices),
                                        });
                                      }}
                                      className="h-8 w-40"
                                    />
                                  </label>
                                  <label className="flex items-center gap-2">
                                    По умолчанию
                                    <Input
                                      type="number"
                                      min={1}
                                      max={60}
                                      value={field.defaultDuration ?? ''}
                                      onChange={(event) => updateField(index, { defaultDuration: event.target.value ? Number(event.target.value) : undefined })}
                                      className="h-8 w-24"
                                    />
                                  </label>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                  {(field.durationOptions ?? [5, 8, 10]).map((duration) => (
                                    <label key={duration} className="space-y-1 text-xs text-slate-400">
                                      <span>{duration} сек, цена</span>
                                      <Input
                                        type="number"
                                        min={1}
                                        placeholder="fallback"
                                        value={durationPriceInputValue(field, duration)}
                                        onChange={(event) => updateField(index, {
                                          durationPrices: setDurationPrice(field, duration, event.target.value),
                                        })}
                                        className="h-8"
                                      />
                                    </label>
                                  ))}
                                </div>
                                <p className="text-xs text-slate-500">
                                  Если цена для длительности пустая, используется обычная цена услуги. Заполненные значения списываются как финальная цена генерации.
                                </p>
                              </div>
                            )}
                            {field.type === 'slides' && (
                              <label className="flex items-center gap-2">
                                Макс. слайдов
                                <Input
                                  type="number"
                                  min={1}
                                  max={20}
                                  value={field.maxSlides ?? ''}
                                  onChange={(event) => updateField(index, { maxSlides: event.target.value ? Number(event.target.value) : undefined })}
                                  className="h-8 w-24"
                                />
                              </label>
                            )}
                            {field.type === 'checkbox' && (
                              <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950/60 p-3">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={field.defaultChecked === true}
                                    onChange={(event) => updateField(index, { defaultChecked: event.target.checked })}
                                  />
                                  Включена по умолчанию
                                </label>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <label className="space-y-1 text-xs text-slate-400">
                                    <span>Цена БЕЗ галочки (коины)</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder="напр. фото"
                                      value={field.priceCoinsUnchecked ?? ''}
                                      onChange={(event) => updateField(index, { priceCoinsUnchecked: event.target.value ? Number(event.target.value) : undefined })}
                                      className="h-8"
                                    />
                                  </label>
                                  <label className="space-y-1 text-xs text-slate-400">
                                    <span>Цена С галочкой (коины)</span>
                                    <Input
                                      type="number"
                                      min={1}
                                      placeholder="напр. фото + анимация"
                                      value={field.priceCoinsChecked ?? ''}
                                      onChange={(event) => updateField(index, { priceCoinsChecked: event.target.value ? Number(event.target.value) : undefined })}
                                      className="h-8"
                                    />
                                  </label>
                                </div>
                                <div className="space-y-2 rounded-md border border-zinc-800/80 bg-zinc-900/40 p-2.5">
                                  <label className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                    <span title="Когда это фото-поле заполнено — применяются «вторые» цены ниже (напр. 2 человека).">Поле «второй элемент» (id фото-поля)</span>
                                    <select
                                      value={field.secondaryField ?? ''}
                                      onChange={(event) => updateField(index, { secondaryField: event.target.value || undefined })}
                                      className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                                    >
                                      <option value="">— нет (одна пара цен) —</option>
                                      {fields
                                        .filter((item) => item.type === 'photo' || item.type === 'avatar')
                                        .map((item) => (
                                          <option key={item.id} value={item.id}>{item.id}</option>
                                        ))}
                                    </select>
                                  </label>
                                  {field.secondaryField && (
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      <label className="space-y-1 text-xs text-slate-400">
                                        <span>Цена БЕЗ галочки, со 2-м (коины)</span>
                                        <Input
                                          type="number"
                                          min={1}
                                          placeholder="напр. 2 чел."
                                          value={field.priceCoinsUncheckedSecondary ?? ''}
                                          onChange={(event) => updateField(index, { priceCoinsUncheckedSecondary: event.target.value ? Number(event.target.value) : undefined })}
                                          className="h-8"
                                        />
                                      </label>
                                      <label className="space-y-1 text-xs text-slate-400">
                                        <span>Цена С галочкой, со 2-м (коины)</span>
                                        <Input
                                          type="number"
                                          min={1}
                                          placeholder="напр. 2 чел. + анимация"
                                          value={field.priceCoinsCheckedSecondary ?? ''}
                                          onChange={(event) => updateField(index, { priceCoinsCheckedSecondary: event.target.value ? Number(event.target.value) : undefined })}
                                          className="h-8"
                                        />
                                      </label>
                                    </div>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500">
                                  Цена услуги = выбранная комбинация: галочка (вкл/выкл) × «второй элемент» (заполнен/нет). Если «второй элемент» не задан — работают только две первые цены. Если пусто — обычная цена услуги. Условный шаг пайплайна запускается, когда галочка включена (поле <code>when</code>: field = id галочки, value = <code>true</code>).
                                </p>
                              </div>
                            )}
                            {field.type === 'aspect_ratio' && (
                              <label className="flex items-center gap-2">
                                Опции (через запятую)
                                <Input
                                  value={(field.aspectOptions ?? ['auto', '9:16', '16:9', '1:1']).join(',')}
                                  onChange={(event) => {
                                    const allowed = new Set(['auto', '9:16', '16:9', '1:1', '4:3', '3:4']);
                                    const parts = event.target.value
                                      .split(',')
                                      .map((item) => item.trim())
                                      .filter((item): item is 'auto' | '9:16' | '16:9' | '1:1' | '4:3' | '3:4' => allowed.has(item));
                                    updateField(index, { aspectOptions: parts.length > 0 ? parts : undefined });
                                  }}
                                  className="h-8 w-56"
                                />
                              </label>
                            )}
                          </div>
                          {(field.type === 'select' || field.type === 'multiselect') && (
                            <div className="space-y-2">
                              <FieldLabel help="Список вариантов, которые увидит пользователь. «Подпись» — то, что видит пользователь; «значение» — то, что уходит в pipeline. Для multiselect можно задать цену каждого варианта.">Варианты списка</FieldLabel>
                              <div className="space-y-2">
                                {(field.options ?? []).map((option, optionIndex) => (
                                  <div key={optionIndex} className="grid gap-2 rounded-md border border-zinc-800 bg-zinc-900 p-2 md:grid-cols-[1fr_180px_auto]">
                                    <Input
                                      value={option.label}
                                      placeholder="Подпись для пользователя"
                                      onChange={(event) => {
                                        const options = (field.options ?? []).map((item, current) =>
                                          current === optionIndex ? { ...item, label: event.target.value } : item,
                                        );
                                        updateField(index, { options });
                                      }}
                                    />
                                    <div className="flex gap-2">
                                      <Input
                                        value={option.value}
                                        placeholder="значение"
                                        className="font-mono"
                                        onChange={(event) => {
                                          const options = (field.options ?? []).map((item, current) =>
                                            current === optionIndex ? { ...item, value: event.target.value } : item,
                                          );
                                          updateField(index, { options });
                                        }}
                                      />
                                      {field.type === 'multiselect' && (
                                        <Input
                                          type="number"
                                          min={0}
                                          value={option.priceCoins ?? ''}
                                          placeholder="цена"
                                          title="Цена варианта, токены"
                                          onChange={(event) => {
                                            const options = (field.options ?? []).map((item, current) =>
                                              current === optionIndex
                                                ? { ...item, priceCoins: event.target.value ? Number(event.target.value) : undefined }
                                                : item,
                                            );
                                            updateField(index, { options });
                                          }}
                                        />
                                      )}
                                    </div>
                                    <div className="flex items-center justify-end gap-2">
                                      {field.type === 'multiselect' && (
                                        <label className="flex items-center gap-1 text-xs text-slate-400">
                                          <input
                                            type="checkbox"
                                            checked={option.disabled === true}
                                            onChange={(event) => {
                                              const options = (field.options ?? []).map((item, current) =>
                                                current === optionIndex ? { ...item, disabled: event.target.checked || undefined } : item,
                                              );
                                              updateField(index, { options });
                                            }}
                                          />
                                          выкл.
                                        </label>
                                      )}
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => updateField(index, { options: (field.options ?? []).filter((_item, current) => current !== optionIndex) })}
                                        aria-label="Удалить вариант"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    {field.type === 'multiselect' && (
                                      <Input
                                        value={option.hint ?? ''}
                                        placeholder="подсказка под вариантом"
                                        className="md:col-span-3"
                                        onChange={(event) => {
                                          const options = (field.options ?? []).map((item, current) =>
                                            current === optionIndex ? { ...item, hint: event.target.value || undefined } : item,
                                          );
                                          updateField(index, { options });
                                        }}
                                      />
                                    )}
                                  </div>
                                ))}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const options = [...(field.options ?? [])];
                                  options.push({
                                    label: `Вариант ${options.length + 1}`,
                                    value: `option_${options.length + 1}`,
                                    ...(field.type === 'multiselect' ? { priceCoins: 1 } : {}),
                                  });
                                  updateField(index, { options });
                                }}
                              >
                                <Plus className="h-4 w-4" />
                                Добавить вариант
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </SortableFrame>
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-zinc-700 bg-zinc-950/60 p-3">
          <Plus className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-300">Добавить поле формы:</span>
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) addField(event.target.value as UserInputField['type']);
              event.target.value = '';
            }}
            className="h-10 min-w-[220px] flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-slate-100 md:flex-none"
          >
            <option value="">Выберите тип поля…</option>
            {(['text', 'textarea', 'photo', 'video', 'select', 'multiselect', 'checkbox', 'slides', 'media-select', 'avatar', 'audio', 'duration', 'aspect_ratio', 'music-select'] as const).map((type) => (
              <option key={type} value={type}>
                {fieldTypeLabels[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        {servicePreview && (
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <div className="border-b border-zinc-800 px-4 py-2.5 text-sm font-semibold text-white">Как увидит пользователь</div>
            <div className="p-4">
              <div className="overflow-hidden rounded-lg border border-zinc-800">
                {servicePreview.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={servicePreview.imageUrl} alt="" className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-zinc-900 text-xs text-slate-500">Превью услуги</div>
                )}
              </div>
              <div className="mt-3 text-lg font-bold text-white">{servicePreview.title || 'Название услуги'}</div>
              {servicePreview.shortDesc && <p className="mt-1 text-sm leading-6 text-slate-400">{servicePreview.shortDesc}</p>}
              <div className="mt-3 rounded-md border border-amber-400/50 bg-amber-400/10 p-3 text-center">
                <div className="text-[11px] uppercase tracking-wide text-amber-300">Стоимость услуги</div>
                <div className="text-xl font-black text-amber-200">{servicePreview.priceCoins} коинов</div>
              </div>
            </div>
          </div>
        )}
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="font-semibold text-white">Предпросмотр формы</h3>
        <div className="mt-4 space-y-4">
          {fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label>{field.label}{field.required ? ' *' : ''}</Label>
              {field.type === 'textarea' && <Textarea disabled placeholder={field.placeholder} />}
              {field.type === 'photo' && (
                <div className="flex h-28 items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-slate-500">
                  <Upload className="mr-2 h-4 w-4" />
                  Фото
                </div>
              )}
              {field.type === 'video' && (
                <div className="flex h-28 flex-col items-center justify-center rounded-md border border-dashed border-zinc-700 text-sm text-slate-500">
                  <Upload className="mb-1 h-4 w-4" />
                  Видео{field.maxDurationSec ? ` (до ${field.maxDurationSec} сек)` : ''}
                </div>
              )}
              {field.type === 'select' && (
                <select disabled className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-400">
                  {(field.options ?? []).map((option) => (
                    <option key={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
              {field.type === 'media-select' && (
                <select disabled className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-400">
                  <option>{field.mediaKind ?? 'media-kind'}</option>
                </select>
              )}
              {field.type === 'avatar' && <Input disabled placeholder="Выбор аватара" />}
              {field.type === 'tier' && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md border border-rose-500 bg-rose-500/10 p-3">Стандарт</div>
                  <div className="rounded-md border border-zinc-700 p-3">Pro</div>
                </div>
              )}
              {field.type === 'text' && <Input disabled placeholder={field.placeholder} />}
              {field.hint && <p className="text-xs text-slate-500">{field.hint}</p>}
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  );
}

export function PipelineTestPanel({ generationId, onClose }: { generationId: string; onClose: () => void }) {
  const { data, isFetching } = useGetProjectStatusQuery(generationId, { pollingInterval: 3000 });
  const steps = data?.stepProgress ?? [];
  const finalUrl = data?.resultVideo ?? data?.resultImage ?? data?.resultThumbnail ?? null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Тестовый прогон</h3>
          <p className="mt-1 text-sm text-slate-400">{generationId}</p>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Закрыть">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex justify-between text-sm">
          <span>{data?.status ?? 'PENDING'}{isFetching ? ' · polling' : ''}</span>
          <span>{data?.progress ?? 0}%</span>
        </div>
        <Progress value={data?.progress ?? 0} />
      </div>
      <div className="mt-5 space-y-3">
        {steps.length === 0 && <div className="text-sm text-slate-500">Шаги появятся после старта worker.</div>}
        {steps.map((step) => {
          const url = outputUrl(step.output);
          return (
            <div key={step.stepId} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-white">{step.stepId} · {step.blockSlug}</span>
                <Badge className={cn(step.status === 'completed' && 'bg-emerald-600', step.status === 'failed' && 'bg-red-700', step.status === 'processing' && 'bg-amber-600')}>
                  {step.status} · {step.progress}%
                </Badge>
              </div>
              {step.errorMessage && <p className="mt-2 text-sm text-red-200">{step.errorMessage}</p>}
              {url && (
                <Link href={url} target="_blank" className="mt-2 block text-sm text-rose-300 hover:text-rose-200">
                  {url}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {finalUrl && (
        <div className="mt-5 rounded-md border border-zinc-800 p-3">
          <div className="mb-2 text-sm font-medium text-white">Финальный результат</div>
          {data?.resultImage ? <img src={data.resultImage} alt="" className="max-h-72 rounded-md object-contain" /> : null}
          {data?.resultVideo ? <video src={data.resultVideo} controls className="max-h-72 rounded-md" /> : null}
          <Link href={finalUrl} target="_blank" className="mt-2 block text-sm text-rose-300 hover:text-rose-200">
            Открыть результат
          </Link>
        </div>
      )}
      {data?.errorMessage && <p className="mt-4 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">{data.errorMessage}</p>}
    </div>
  );
}

export function AdminServiceForm({ mode, service }: AdminServiceFormProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<FormDraft>(() => initialDraft(service));
  const [previewImage, setPreviewImage] = useState<File | null>(null);
  const [previewVideo, setPreviewVideo] = useState<File | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(service?.previewImage ?? '');
  const [previewVideoUrl, setPreviewVideoUrl] = useState(service?.previewVideo ?? '');
  const [removeImage, setRemoveImage] = useState(false);
  const [removeVideo, setRemoveVideo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testGenerationId, setTestGenerationId] = useState<string | null>(null);
  const { data: blocksData } = useGetAdminBlocksQuery();
  const [createService, createState] = useCreateAdminServiceMutation();
  const [updateService, updateState] = useUpdateAdminServiceMutation();
  const [testRun, testRunState] = useTestRunAdminServiceMutation();
  const settings = useGetAdminSettingsQuery();
  const categoriesQuery = useListAdminServiceCategoriesQuery();
  const mediaAssetsQuery = useListAdminMediaAssetsQuery({ page: 1, limit: 100, isActive: true });
  const availableCategories = categoriesQuery.data?.items ?? [];
  const categoriesLoading = categoriesQuery.isLoading;
  useEffect(() => {
    if (draft.category) return;
    if (availableCategories.length === 0) return;
    setDraft((current) => (current.category ? current : { ...current, category: availableCategories[0].code }));
  }, [availableCategories, draft.category]);
  const [updateSettings, updateSettingsState] = useUpdateAdminSettingsMutation();
  const blocks = blocksData?.blocks;
  const usdToRub = settings.data?.settings.usdToRub ?? 80;
  const modelPriceOverrides = settings.data?.settings.modelPriceOverrides ?? {};
  const isCreate = mode === 'create';
  const isBusy = createState.isLoading || updateState.isLoading;
  const errors = useMemo(() => validationErrors(draft.pipelineConfig, draft.userInputForm), [draft.pipelineConfig, draft.userInputForm]);
  const hasSlidesPricing = draft.userInputForm.some((field) => field.type === 'slides');
  const hasPricedMultiselect = draft.userInputForm.some(
    (field) => field.type === 'multiselect' && (field.options ?? []).some((option) => typeof option.priceCoins === 'number'),
  );
  const hasDurationPricing = draft.userInputForm.some(
    (field) => field.type === 'duration' && (field.durationPrices ?? []).length > 0,
  );
  const pricingSummary = useMemo(() => summarizePipelinePricing(draft.pipelineConfig, blocks, usdToRub), [draft.pipelineConfig, blocks, usdToRub]);
  const costPro = pricingSummary.pro.costCoins;
  const standardMargin = useMemo(
    () => serviceMargin(draft.priceCoinsStandard, pricingSummary.standard.costUsd, usdToRub),
    [draft.priceCoinsStandard, pricingSummary.standard.costUsd, usdToRub],
  );
  const proMargin = useMemo(
    () => serviceMargin(draft.priceCoinsPro, pricingSummary.pro.costUsd, usdToRub),
    [draft.priceCoinsPro, pricingSummary.pro.costUsd, usdToRub],
  );
  const imageObjectUrl = useMemo(() => (previewImage ? URL.createObjectURL(previewImage) : null), [previewImage]);
  const videoObjectUrl = useMemo(() => (previewVideo ? URL.createObjectURL(previewVideo) : null), [previewVideo]);
  const imagePreviewUrl = removeImage ? null : (imageObjectUrl ?? previewImageUrl) || null;
  const videoPreviewUrl = removeVideo ? null : (videoObjectUrl ?? previewVideoUrl) || null;
  const imageAssets = useMemo(
    () => (mediaAssetsQuery.data?.items ?? []).filter((asset) => asset.mimeType.startsWith('image/')),
    [mediaAssetsQuery.data?.items],
  );
  const videoAssets = useMemo(
    () => (mediaAssetsQuery.data?.items ?? []).filter((asset) => asset.mimeType.startsWith('video/')),
    [mediaAssetsQuery.data?.items],
  );

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const updateDraft = (patch: Partial<FormDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  };

  const changeImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPreviewImage(file);
    if (file) setRemoveImage(false);
    setDirty(true);
  };

  const changeVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setPreviewVideo(file);
    if (file) setRemoveVideo(false);
    setDirty(true);
  };

  const buildBody = () => {
    const form = new FormData();
    form.append(
      'data',
      JSON.stringify({
        slug: draft.slug,
        title: draft.title,
        shortDesc: draft.shortDesc,
        description: draft.description,
        category: draft.category,
        pipelineConfig: canonicalisePipelineConfig(draft.pipelineConfig),
        userInputForm: draft.userInputForm,
        priceCoinsStandard: draft.priceCoinsStandard,
        priceCoinsPro: draft.priceCoinsPro,
        previewImage: removeImage ? null : previewImageUrl || undefined,
        previewVideo: removeVideo ? null : previewVideoUrl || undefined,
        previewMode: draft.previewMode,
        isActive: draft.isActive,
        isFeatured: draft.isFeatured,
      }),
    );
    if (previewImage) form.append('previewImage', previewImage);
    else if (removeImage) form.append('removePreviewImage', 'true');
    if (previewVideo) form.append('previewVideo', previewVideo);
    else if (removeVideo) form.append('removePreviewVideo', 'true');
    return form;
  };

  const save = async (stay: boolean) => {
    if (errors.length > 0) {
      toast({ title: 'Исправьте ошибки pipeline и формы', variant: 'destructive' });
      return;
    }
    try {
      if (isCreate) {
        const result = await createService(buildBody()).unwrap();
        setDirty(false);
        if (stay) {
          router.push(`/admin/services/${result.service.id}`);
        } else {
          router.push('/admin/services');
        }
        return;
      }
      if (!service) return;
      await updateService({ id: service.id, body: buildBody() }).unwrap();
      setDirty(false);
      toast({ title: 'Услуга сохранена' });
      if (!stay) router.push('/admin/services');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await save(false);
  };

  const cancel = () => {
    if (dirty && !window.confirm('Есть несохранённые изменения. Выйти без сохранения?')) return;
    router.push('/admin/services');
  };

  const runTest = async () => {
    if (!service) {
      toast({ title: 'Сначала сохраните услугу', variant: 'destructive' });
      return;
    }
    if (errors.length > 0) {
      toast({ title: 'Пайплайн невалиден', variant: 'destructive' });
      return;
    }
    try {
      const result = await testRun({
        id: service.id,
        userInputs: buildMockUserInputs(draft.userInputForm),
        selectedTier: 'standard',
      }).unwrap();
      setTestGenerationId(result.generationId);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const saveModelPrice = async (slug: string, priceCoins: number) => {
    try {
      await updateSettings({
        modelPriceOverrides: {
          ...modelPriceOverrides,
          [slug]: priceCoins,
        },
      }).unwrap();
      toast({ title: 'Цена модели сохранена' });
    } catch {
      toast({ title: 'Не удалось сохранить цену модели', variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section title="Основное" description="Публичные тексты, категория и статус публикации.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slug">Слаг</Label>
            <Input
              id="slug"
              value={draft.slug}
              onChange={(event) => updateDraft({ slug: event.target.value })}
              placeholder="test-revive"
              disabled={!isCreate}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Категория</Label>
            <select
              id="category"
              value={draft.category}
              onChange={(event) => updateDraft({ category: event.target.value })}
              className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
            >
              <option value="" disabled>{categoriesLoading ? 'Загрузка...' : 'Выберите категорию'}</option>
              {availableCategories.map((category) => (
                <option key={category.code} value={category.code}>
                  {category.title}
                </option>
              ))}
            </select>
            {!categoriesLoading && availableCategories.length === 0 && (
              <p className="text-xs text-amber-300">Сначала создайте хотя бы одну категорию в разделе «Категории».</p>
            )}
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="title">Название</Label>
            <Input id="title" value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} required />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="shortDesc">Короткое описание</Label>
            <Textarea id="shortDesc" value={draft.shortDesc} onChange={(event) => updateDraft({ shortDesc: event.target.value })} rows={2} required />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea id="description" value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} rows={5} required />
          </div>
          <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => updateDraft({ isActive: event.target.checked })} />
            Услуга активна
          </label>
          <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
            <input type="checkbox" checked={draft.isFeatured} onChange={(event) => updateDraft({ isFeatured: event.target.checked })} />
            Рекомендуемая
          </label>
        </div>
      </Section>

      <details className={cn('rounded-lg border p-5', marginTone(proMargin.marginPercent ?? 0))}>
        <summary className="cursor-pointer font-semibold text-white">Как работает эта услуга</summary>
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-slate-200">{pipelineSentence(draft.pipelineConfig, blocks)}</p>
          <div>
            <div>Себестоимость {formatMoney({ usd: pricingSummary.pro.costUsd }, { primary: 'usd', showAll: true, usdToRub })}</div>
            <div>Цена {formatMoney({ coins: draft.priceCoinsPro }, { primary: 'coins', showAll: true, usdToRub })}</div>
            <div>Маржа {proMargin.marginPercent === null ? 'н/д' : `${proMargin.marginPercent.toFixed(1)}%`} · {formatMoney({ usd: proMargin.profitUsd }, { primary: 'usd', showAll: true, usdToRub })}</div>
          </div>
          {proMargin.profitCoins < 0 && (
            <div className="rounded-md border border-red-700 bg-red-950/60 p-3 font-medium text-red-100">
              Услуга убыточна на {formatMoney({ coins: Math.abs(proMargin.profitCoins) }, { primary: 'rub' })} за каждую генерацию. Поднимите цену.
            </div>
          )}
        </div>
      </details>

      <Section title="Превью" description="Картинка и/или видео. Можно хранить оба файла и выбрать, что показывать на витрине.">
        <div className="mb-5 max-w-sm space-y-2">
          <Label htmlFor="previewMode">Что показывать на превью</Label>
          <select
            id="previewMode"
            value={draft.previewMode}
            onChange={(event) => updateDraft({ previewMode: event.target.value as FormDraft['previewMode'] })}
            className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
          >
            <option value="auto">Авто: видео, если есть</option>
            <option value="image">Фото превью</option>
            <option value="video">Видео превью</option>
          </select>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
              <Label htmlFor="previewImage">Превью-изображение</Label>
            <Input id="previewImage" type="file" accept="image/*" onChange={changeImage} />
            {fileName(previewImage) && <p className="text-xs text-slate-400">{fileName(previewImage)}</p>}
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="" className="h-40 w-full rounded-md object-cover" />
            ) : (service?.previewImage && !removeImage) ? (
              <img src={service.previewImage} alt="" className="h-40 w-full rounded-md object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-zinc-700 text-slate-500">
                <ImageIcon className="mr-2 h-4 w-4" />
                Нет изображения
              </div>
            )}
            {(imagePreviewUrl || (service?.previewImage && !removeImage)) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setPreviewImage(null); setPreviewImageUrl(''); setRemoveImage(true); setDirty(true); }}
              >
                <Trash2 className="h-4 w-4" />
                Удалить изображение
              </Button>
            )}
            <PreviewAssetPicker
              assets={imageAssets}
              isLoading={mediaAssetsQuery.isLoading}
              selectedUrl={previewImageUrl}
              onSelect={(asset) => {
                setPreviewImage(null);
                setPreviewImageUrl(asset.publicUrl);
                setRemoveImage(false);
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-2">
              <Label htmlFor="previewVideo">Превью-видео</Label>
            <Input id="previewVideo" type="file" accept="video/*" onChange={changeVideo} />
            {fileName(previewVideo) && <p className="text-xs text-slate-400">{fileName(previewVideo)}</p>}
            {videoPreviewUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={videoPreviewUrl} controls className="h-40 w-full rounded-md bg-black object-contain" />
            ) : (service?.previewVideo && !removeVideo) ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={service.previewVideo} controls className="h-40 w-full rounded-md bg-black object-contain" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-zinc-700 text-slate-500">
                <Video className="mr-2 h-4 w-4" />
                Нет видео
              </div>
            )}
            {(videoPreviewUrl || (service?.previewVideo && !removeVideo)) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setPreviewVideo(null); setPreviewVideoUrl(''); setRemoveVideo(true); setDirty(true); }}
              >
                <Trash2 className="h-4 w-4" />
                Удалить видео
              </Button>
            )}
            <PreviewAssetPicker
              assets={videoAssets}
              isLoading={mediaAssetsQuery.isLoading}
              selectedUrl={previewVideoUrl}
              onSelect={(asset) => {
                setPreviewVideo(null);
                setPreviewVideoUrl(asset.publicUrl);
                setRemoveVideo(false);
                setDirty(true);
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Цена" description="Себестоимость считается по блокам и выбранным моделям. Для карусели основная цена считается за один слайд; для чекбоксов с ценами итог берётся из выбранных вариантов.">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="space-y-2">
            <Label htmlFor="pricePro">{hasSlidesPricing ? 'Цена за 1 слайд, токены' : hasPricedMultiselect || hasDurationPricing ? 'Резервная цена услуги, токены' : 'Цена услуги, токены'}</Label>
            <Input
              id="pricePro"
              type="number"
              min={1}
              value={draft.priceCoinsPro}
              onChange={(event) => {
                const next = Number(event.target.value);
                updateDraft({ priceCoinsPro: next, priceCoinsStandard: next });
              }}
            />
            {hasPricedMultiselect && (
              <p className="text-xs text-slate-500">Для этой услуги итоговая цена берётся из цен выбранных чекбоксов в форме пользователя.</p>
            )}
            {hasDurationPricing && (
              <p className="text-xs text-slate-500">Для этой услуги итоговая цена берётся из выбранной длительности, если для неё задана цена.</p>
            )}
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="text-sm text-slate-400">Себестоимость</div>
            <div className="mt-2 text-lg font-semibold text-white">~{costPro} коинов</div>
            <p className="mt-2 text-xs text-slate-500">Рекомендуем минимум 3-4× себестоимости.</p>
          </div>
        </div>
      </Section>

      <Section title="Пайплайн" description="Шаги выполняются сверху вниз. Плейсхолдеры: {{user.photo}}, {{step_1.output}}.">
        <PipelineBuilder
          steps={draft.pipelineConfig}
          fields={draft.userInputForm}
          blocks={blocks}
          onChange={(pipelineConfig) => updateDraft({ pipelineConfig })}
          usdToRub={usdToRub}
          modelPriceOverrides={modelPriceOverrides}
          onModelPriceChange={saveModelPrice}
          modelPriceSaving={updateSettingsState.isLoading}
        />
      </Section>

      <Section title="Форма для юзера" description="Поля, которые увидит пользователь на странице услуги. Слева — конструктор, справа — живой предпросмотр формы и карточки услуги.">
        <UserInputFormBuilder
          fields={draft.userInputForm}
          onChange={(userInputForm) => updateDraft({ userInputForm })}
          servicePreview={{
            title: draft.title,
            shortDesc: draft.shortDesc,
            priceCoins: draft.priceCoinsPro,
            imageUrl: imagePreviewUrl ?? service?.previewImage ?? null,
          }}
        />
      </Section>

      <Section title="Тестовый прогон" description="Запускает сохранённый pipeline на моковых данных и показывает прогресс.">
        <div className="space-y-4">
          <Button type="button" onClick={runTest} disabled={isCreate || errors.length > 0 || testRunState.isLoading} className="bg-rose-500 hover:bg-rose-400">
            <Play className="h-4 w-4" />
            Запустить тест
          </Button>
          {isCreate && <p className="text-sm text-slate-500">Тестовый прогон доступен после первого сохранения.</p>}
          {testGenerationId && <PipelineTestPanel generationId={testGenerationId} onClose={() => setTestGenerationId(null)} />}
        </div>
      </Section>

      <div className="sticky bottom-0 z-20 -mx-4 border-t border-zinc-800 bg-zinc-950/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-500">{dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={cancel}>
              Отмена
            </Button>
            <Button type="button" variant="outline" onClick={() => save(true)} disabled={isBusy || !dirty}>
              <Save className="h-4 w-4" />
              Сохранить и оставаться
            </Button>
            <Button type="submit" disabled={isBusy || !dirty} className="bg-rose-500 hover:bg-rose-400">
              <Save className="h-4 w-4" />
              Сохранить и закрыть
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
