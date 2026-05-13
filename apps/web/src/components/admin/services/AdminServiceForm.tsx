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
import type { BlockCatalogItem, JsonSchemaObject, ModelOption } from '@allvision/shared';
import {
  formatMoney,
  formatAdminServiceValidationError,
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
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { useGetProjectStatusQuery } from '@/store/api/projects-api';

const editableCategories: ServiceCategory[] = [
  'NOSTALGIA',
  'TRENDS_MEMES',
  'KIDS_HEROES',
  'SPECIAL_OCCASIONS',
];

const categoryLabels: Record<string, string> = {
  NOSTALGIA: 'Ностальгия',
  TRENDS_MEMES: 'Тренды и мемы',
  KIDS_HEROES: 'Дети-герои',
  SPECIAL_OCCASIONS: 'Особые поводы',
  PHOTO_RESTORE: 'Фото: восстановление',
  PHOTO_ANIMATE: 'Фото: анимация',
  TREND: 'Тренды Studio v1',
  CARTOON_CUSTOM: 'Мульт на заказ',
  REALISTIC_CUSTOM: 'Реалистичное видео',
  FAIRY_TALE: 'Сказки',
};

const fieldTypeLabels: Record<UserInputField['type'], string> = {
  text: 'Текст',
  textarea: 'Большой текст',
  photo: 'Фото',
  select: 'Select',
  'media-select': 'Media select',
  avatar: 'Avatar',
  tier: 'Quality tier',
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
  return [
    {
      id: 'tier',
      type: 'tier',
      label: 'Качество',
      required: true,
      hint: 'Стандарт или Pro',
    },
  ];
}

function normaliseCategory(category?: ServiceCategory | null): ServiceCategory {
  return category && editableCategories.includes(category) ? category : 'NOSTALGIA';
}

function normalisePipeline(value: AdminService['pipelineConfig'] | undefined): PipelineStep[] {
  if (!Array.isArray(value)) return [];
  return value.map((step) => ({
    id: step.id,
    blockSlug: step.blockSlug,
    input: step.input,
    params: isRecord(step.params) ? step.params : {},
  }));
}

function normaliseUserInputForm(value: AdminService['userInputForm'] | undefined): UserInputField[] {
  if (!Array.isArray(value) || value.length === 0) return defaultUserInputForm();
  const withoutExtraTier = value.filter((field, index) => field.type !== 'tier' || value.findIndex((item) => item.type === 'tier') === index);
  const hasTier = withoutExtraTier.some((field) => field.type === 'tier');
  return hasTier ? withoutExtraTier : [...withoutExtraTier, ...defaultUserInputForm()];
}

function initialDraft(service?: AdminService): FormDraft {
  return {
    slug: service?.slug ?? '',
    title: service?.title ?? '',
    shortDesc: service?.shortDesc ?? '',
    description: service?.description ?? '',
    category: normaliseCategory(service?.category),
    priceCoinsStandard: service?.priceCoinsStandard ?? service?.priceTokens ?? 200,
    priceCoinsPro: service?.priceCoinsPro ?? Math.max((service?.priceTokens ?? 200) * 2, 400),
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
  return (
    models.find((model) => model.tierHint === tier)?.slug ??
    models.find((model) => model.tierHint === 'both')?.slug ??
    models[0]?.slug ??
    ''
  );
}

function modelBySlug(models: ModelOption[], slug: unknown) {
  return typeof slug === 'string' ? models.find((model) => model.slug === slug) : undefined;
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

function blockCategoryLabel(block: BlockCatalogItem) {
  if (block.category === 'motion') return 'motion-transfer';
  return block.category;
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

function stepCost(step: PipelineStep, block: BlockCatalogItem | undefined, tier: 'standard' | 'pro') {
  if (!block) return 0;
  const params = isRecord(step.params) ? step.params : {};
  const modelParam = params.model;
  let modelSlug: string | undefined;
  if (typeof modelParam === 'string') modelSlug = modelParam;
  if (isRecord(modelParam) && typeof modelParam[tier] === 'string') modelSlug = modelParam[tier];
  const model =
    block.supportedModels.find((item) => item.slug === modelSlug) ??
    block.supportedModels.find((item) => item.tierHint === tier) ??
    block.supportedModels.find((item) => item.tierHint === 'both') ??
    block.supportedModels[0];
  const base = model?.estimatedCostCoins ?? 0;
  const duration = typeof params.duration === 'number' && params.duration > 5 ? Math.ceil(params.duration / 5) : 1;
  return Math.ceil(base * duration);
}

function calculateCost(steps: PipelineStep[], blocks: BlockCatalogItem[] | undefined, tier: 'standard' | 'pro') {
  return steps.reduce((sum, step) => sum + stepCost(step, blockBySlug(blocks, step.blockSlug), tier), 0);
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

export function buildMockUserInputs(fields: UserInputField[] | null | undefined) {
  const source = normaliseUserInputForm(fields);
  return Object.fromEntries(
    source.map((field) => {
      if (field.type === 'photo') return [field.id, 'mock://admin-test/photo.jpg'];
      if (field.type === 'avatar') return [field.id, 'mock-avatar-admin'];
      if (field.type === 'select') return [field.id, field.options?.[0]?.value ?? 'mock-option'];
      if (field.type === 'tier') return [field.id, 'standard'];
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

function BlockParamsForm({
  block,
  value,
  onChange,
  usdToRub,
}: {
  block: BlockCatalogItem;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  usdToRub: number;
}) {
  const update = (key: string, next: unknown) => onChange({ ...value, [key]: next });
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
                {model.title} · {providerLabel(model.provider)} · {formatMoney({ coins: model.estimatedCostCoins }, { primary: 'coins', showAll: true, usdToRub })}
                {model.estimatedCostUsd ? ` · ${formatMoney({ usd: model.estimatedCostUsd }, { primary: 'usd', showAll: true, usdToRub })}` : ''}
              </div>
              {model.description && <p className="mt-2 text-slate-400">{model.description}</p>}
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
      {Object.entries(block.paramsSchema.properties ?? {}).map(([key, rawSchema]) => {
        const schema = schemaObject(rawSchema);
        const label = schema.title ?? key;

        if (key === 'model' || isTierModelSchema(schema)) {
          const current = isRecord(value[key]) ? value[key] : defaultValueForSchema(schema, block, key);
          const record = isRecord(current) ? current : {};
          return (
            <div key={key} className="md:col-span-2">
              <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {(['standard', 'pro'] as const).map((tier) => (
                  <div key={tier} className="space-y-1">
                    <span className="text-xs uppercase text-slate-500">{tier === 'standard' ? 'Стандарт' : 'Pro'}</span>
                    <select
                      value={selectValue(record[tier]) || preferredModel(block.supportedModels, tier)}
                      onChange={(event) => update(key, { ...record, [tier]: event.target.value })}
                      className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
                    >
                      {block.supportedModels.map((model) => (
                        <option key={model.slug} value={model.slug}>
                          {model.title} · ~{model.estimatedCostCoins} коинов
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        if (schema.enum?.length) {
          return (
            <div key={key} className="space-y-2">
              <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
              <select
                value={selectValue(value[key])}
                onChange={(event) => update(key, coerceBySchema(event.target.value, schema))}
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
              >
                {schema.enum.map((option) => (
                  <option key={String(option)} value={String(option)}>
                    {String(option)}
                  </option>
                ))}
              </select>
              {schema.description && <p className="text-xs text-slate-500">{schema.description}</p>}
            </div>
          );
        }

        if (schema.type === 'boolean') {
          return (
            <label key={key} className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={Boolean(value[key])}
                onChange={(event) => update(key, event.target.checked)}
                className="h-4 w-4"
              />
              {label}
              <HelpTip text={fieldHelp(key, schema)} />
              {schema.description && <span className="text-xs text-slate-500">{schema.description}</span>}
            </label>
          );
        }

        if (schema.type === 'number') {
          return (
            <div key={key} className="space-y-2">
              <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
              <Input
                type="number"
                value={selectValue(value[key])}
                onChange={(event) => update(key, event.target.value === '' ? undefined : Number(event.target.value))}
              />
              {schema.description && <p className="text-xs text-slate-500">{schema.description}</p>}
            </div>
          );
        }

        const isPrompt = key.toLowerCase().includes('prompt') || key.toLowerCase().includes('music');
        return (
          <div key={key} className={cn('space-y-2', isPrompt && 'md:col-span-2')}>
            <FieldLabel help={fieldHelp(key, schema)}>{label}</FieldLabel>
            {isPrompt ? (
              <Textarea value={selectValue(value[key])} rows={3} onChange={(event) => update(key, event.target.value)} />
            ) : (
              <Input value={selectValue(value[key])} onChange={(event) => update(key, event.target.value)} />
            )}
            {schema.description && <p className="text-xs text-slate-500">{schema.description}</p>}
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
}: {
  steps: PipelineStep[];
  fields: UserInputField[];
  blocks: BlockCatalogItem[] | undefined;
  onChange: (steps: PipelineStep[]) => void;
  usdToRub: number;
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
    const id = buildStepId(steps);
    const nextStep: PipelineStep = {
      id,
      blockSlug: block.slug,
      input: previous ? `{{${previous.id}.output}}` : '{{user.photo}}',
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
                                    {(blocks ?? []).map((item) => (
                                      <option key={item.slug} value={item.slug}>
                                        {item.slug}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-2">
                                  <Label>Вход</Label>
                                  <Input
                                    value={selectValue(step.input)}
                                    onChange={(event) => updateStep(index, { input: event.target.value })}
                                    placeholder="{{user.photo}} или {{step_1.output}}"
                                    className="font-mono"
                                  />
                                </div>
                              </div>
                              {block ? (
                                <BlockParamsForm
                                  block={block}
                                  value={params}
                                  onChange={(value) => updateStep(index, { params: value })}
                                  usdToRub={usdToRub}
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

      <div className="flex flex-wrap gap-2">
        {(blocks ?? []).map((block) => (
          <Button key={block.slug} type="button" variant="outline" size="sm" onClick={() => addStep(block.slug)}>
            <Plus className="h-4 w-4" />
            {block.title}
          </Button>
        ))}
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
}: {
  fields: UserInputField[];
  onChange: (fields: UserInputField[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
      required: type === 'tier' || type === 'photo',
      ...(type === 'media-select' ? { mediaKind: 'trend-video' } : {}),
      ...(type === 'select' ? { options: [{ label: 'Вариант 1', value: 'option_1' }] } : {}),
      ...(type === 'photo' ? { maxSizeMb: 20, allowedFormats: ['jpg', 'jpeg', 'png'] } : {}),
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
                              <Label>ID</Label>
                              <Input value={field.id} onChange={(event) => updateField(index, { id: event.target.value })} disabled={field.type === 'tier'} />
                            </div>
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <select
                                value={field.type}
                                onChange={(event) => updateField(index, { type: event.target.value as UserInputField['type'] })}
                                disabled={field.type === 'tier'}
                                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
                              >
                                {Object.entries(fieldTypeLabels).map(([type, label]) => (
                                  <option key={type} value={type}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Label</Label>
                              <Input value={field.label} onChange={(event) => updateField(index, { label: event.target.value })} />
                            </div>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <Label>Hint</Label>
                              <Input value={field.hint ?? ''} onChange={(event) => updateField(index, { hint: event.target.value || undefined })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Placeholder</Label>
                              <Input value={field.placeholder ?? ''} onChange={(event) => updateField(index, { placeholder: event.target.value || undefined })} />
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-4 text-sm">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={field.required}
                                onChange={(event) => updateField(index, { required: event.target.checked })}
                                disabled={field.type === 'tier'}
                              />
                              required
                            </label>
                            {(field.type === 'text' || field.type === 'textarea') && (
                              <label className="flex items-center gap-2">
                                maxLength
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
                                max MB
                                <Input
                                  type="number"
                                  min={1}
                                  value={field.maxSizeMb ?? ''}
                                  onChange={(event) => updateField(index, { maxSizeMb: event.target.value ? Number(event.target.value) : undefined })}
                                  className="h-8 w-24"
                                />
                              </label>
                            )}
                            {field.type === 'media-select' && (
                              <label className="flex items-center gap-2">
                                mediaKind
                                <Input
                                  value={field.mediaKind ?? ''}
                                  onChange={(event) => updateField(index, { mediaKind: event.target.value || undefined })}
                                  className="h-8 w-40"
                                />
                              </label>
                            )}
                          </div>
                          {field.type === 'select' && (
                            <div className="space-y-2">
                              <Label>Options</Label>
                              <Textarea
                                rows={3}
                                value={(field.options ?? []).map((option) => `${option.label}:${option.value}`).join('\n')}
                                onChange={(event) => {
                                  const options = event.target.value
                                    .split('\n')
                                    .map((line) => line.trim())
                                    .filter(Boolean)
                                    .map((line) => {
                                      const [label, value] = line.split(':');
                                      return { label: label.trim(), value: (value ?? label).trim() };
                                    });
                                  updateField(index, { options });
                                }}
                                placeholder="Label:value"
                              />
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

        <div className="flex flex-wrap gap-2">
          {(['text', 'textarea', 'photo', 'select', 'media-select', 'avatar'] as const).map((type) => (
            <Button key={type} type="button" variant="outline" size="sm" onClick={() => addField(type)}>
              <Plus className="h-4 w-4" />
              {fieldTypeLabels[type]}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
        <h3 className="font-semibold text-white">Live preview</h3>
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
  const [dirty, setDirty] = useState(false);
  const [testGenerationId, setTestGenerationId] = useState<string | null>(null);
  const { data: blocksData } = useGetAdminBlocksQuery();
  const [createService, createState] = useCreateAdminServiceMutation();
  const [updateService, updateState] = useUpdateAdminServiceMutation();
  const [testRun, testRunState] = useTestRunAdminServiceMutation();
  const settings = useGetAdminSettingsQuery();
  const blocks = blocksData?.blocks;
  const usdToRub = settings.data?.settings.usdToRub ?? 80;
  const isCreate = mode === 'create';
  const isBusy = createState.isLoading || updateState.isLoading;
  const errors = useMemo(() => validationErrors(draft.pipelineConfig, draft.userInputForm), [draft.pipelineConfig, draft.userInputForm]);
  const costStandard = useMemo(() => calculateCost(draft.pipelineConfig, blocks, 'standard'), [draft.pipelineConfig, blocks]);
  const costPro = useMemo(() => calculateCost(draft.pipelineConfig, blocks, 'pro'), [draft.pipelineConfig, blocks]);
  const pricingSummary = useMemo(() => summarizePipelinePricing(draft.pipelineConfig, blocks, usdToRub), [draft.pipelineConfig, blocks, usdToRub]);
  const standardMargin = useMemo(
    () => serviceMargin(draft.priceCoinsStandard, pricingSummary.standard.costUsd, usdToRub),
    [draft.priceCoinsStandard, pricingSummary.standard.costUsd, usdToRub],
  );
  const proMargin = useMemo(
    () => serviceMargin(draft.priceCoinsPro, pricingSummary.pro.costUsd, usdToRub),
    [draft.priceCoinsPro, pricingSummary.pro.costUsd, usdToRub],
  );
  const imagePreviewUrl = useMemo(() => (previewImage ? URL.createObjectURL(previewImage) : null), [previewImage]);

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
    setPreviewImage(event.target.files?.[0] ?? null);
    setDirty(true);
  };

  const changeVideo = (event: ChangeEvent<HTMLInputElement>) => {
    setPreviewVideo(event.target.files?.[0] ?? null);
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
        pipelineConfig: draft.pipelineConfig,
        userInputForm: draft.userInputForm,
        priceCoinsStandard: draft.priceCoinsStandard,
        priceCoinsPro: draft.priceCoinsPro,
        isActive: draft.isActive,
        isFeatured: draft.isFeatured,
      }),
    );
    if (previewImage) form.append('previewImage', previewImage);
    if (previewVideo) form.append('previewVideo', previewVideo);
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
              onChange={(event) => updateDraft({ category: event.target.value as ServiceCategory })}
              className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
            >
              {editableCategories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabels[category]}
                </option>
              ))}
            </select>
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

      <details className={cn('rounded-lg border p-5', marginTone(Math.min(standardMargin.marginPercent ?? 0, proMargin.marginPercent ?? 0)))}>
        <summary className="cursor-pointer font-semibold text-white">Как работает эта услуга</summary>
        <div className="mt-4 space-y-3 text-sm">
          <p className="text-slate-200">{pipelineSentence(draft.pipelineConfig, blocks)}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="text-slate-400">Стандарт</div>
              <div>Себестоимость {formatMoney({ usd: pricingSummary.standard.costUsd }, { primary: 'usd', showAll: true, usdToRub })}</div>
              <div>Цена {formatMoney({ coins: draft.priceCoinsStandard }, { primary: 'coins', showAll: true, usdToRub })}</div>
              <div>Маржа {standardMargin.marginPercent === null ? 'н/д' : `${standardMargin.marginPercent.toFixed(1)}%`} · {formatMoney({ usd: standardMargin.profitUsd }, { primary: 'usd', showAll: true, usdToRub })}</div>
            </div>
            <div>
              <div className="text-slate-400">Pro</div>
              <div>Себестоимость {formatMoney({ usd: pricingSummary.pro.costUsd }, { primary: 'usd', showAll: true, usdToRub })}</div>
              <div>Цена {formatMoney({ coins: draft.priceCoinsPro }, { primary: 'coins', showAll: true, usdToRub })}</div>
              <div>Маржа {proMargin.marginPercent === null ? 'н/д' : `${proMargin.marginPercent.toFixed(1)}%`} · {formatMoney({ usd: proMargin.profitUsd }, { primary: 'usd', showAll: true, usdToRub })}</div>
            </div>
          </div>
          {(standardMargin.profitCoins < 0 || proMargin.profitCoins < 0) && (
            <div className="rounded-md border border-red-700 bg-red-950/60 p-3 font-medium text-red-100">
              Услуга убыточна на {formatMoney({ rub: Math.abs(Math.min(standardMargin.profitCoins, proMargin.profitCoins)) }, { primary: 'rub' })} за каждую генерацию. Поднимите цену.
            </div>
          )}
        </div>
      </details>

      <Section title="Превью" description="Изображение для каталога и видео для страницы услуги.">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
              <Label htmlFor="previewImage">Превью-изображение</Label>
            <Input id="previewImage" type="file" accept="image/*" onChange={changeImage} />
            {fileName(previewImage) && <p className="text-xs text-slate-400">{fileName(previewImage)}</p>}
            {imagePreviewUrl ? (
              <img src={imagePreviewUrl} alt="" className="h-40 w-full rounded-md object-cover" />
            ) : draft && service?.previewImage ? (
              <img src={service.previewImage} alt="" className="h-40 w-full rounded-md object-cover" />
            ) : (
              <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-zinc-700 text-slate-500">
                <ImageIcon className="mr-2 h-4 w-4" />
                Нет изображения
              </div>
            )}
          </div>
          <div className="space-y-2">
              <Label htmlFor="previewVideo">Превью-видео</Label>
            <Input id="previewVideo" type="file" accept="video/*" onChange={changeVideo} />
            {fileName(previewVideo) && <p className="text-xs text-slate-400">{fileName(previewVideo)}</p>}
            {service?.previewVideo ? (
              <Link href={service.previewVideo} target="_blank" className="inline-flex items-center gap-2 text-sm text-rose-300 hover:text-rose-200">
                <Video className="h-4 w-4" />
                Текущее превью-видео
              </Link>
            ) : (
              <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-zinc-700 text-slate-500">
                <Video className="mr-2 h-4 w-4" />
                Нет видео
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section title="Цены" description="Себестоимость считается по блокам и выбранным моделям.">
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priceStandard">Цена Стандарт, коины</Label>
              <Input
                id="priceStandard"
                type="number"
                min={1}
                value={draft.priceCoinsStandard}
                onChange={(event) => updateDraft({ priceCoinsStandard: Number(event.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pricePro">Цена Pro, коины</Label>
              <Input
                id="pricePro"
                type="number"
                min={1}
                value={draft.priceCoinsPro}
                onChange={(event) => updateDraft({ priceCoinsPro: Number(event.target.value) })}
              />
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <div className="text-sm text-slate-400">Себестоимость</div>
            <div className="mt-2 text-lg font-semibold text-white">Стандарт: ~{costStandard} коинов · Pro: ~{costPro} коинов</div>
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
        />
      </Section>

      <Section title="Форма для юзера" description="Поля, которые появятся на странице услуги в P3. Поле тарифа всегда одно и обязательное.">
        <UserInputFormBuilder fields={draft.userInputForm} onChange={(userInputForm) => updateDraft({ userInputForm })} />
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
