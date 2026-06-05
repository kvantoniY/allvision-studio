'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  ImagePlus,
  Info,
  Library,
  Loader2,
  Lock,
  Maximize2,
  Plus,
  Sparkles,
  Star,
  Video,
  X,
} from 'lucide-react';
import { getUserFriendlyError, type ProjectStatus, type PublicService } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useGetServiceQuery, useLaunchServiceMutation } from '@/store/api/services-api';
import { type ProjectListItem, useListProjectsQuery } from '@/store/api/projects-api';
import { useGetServiceCategoriesQuery } from '@/store/api/public-api';
import { useGetPublicMediaAssetsQuery } from '@/store/api/public-api';
import { type UserMediaAsset, useListUserMediaAssetsQuery } from '@/store/api/user-media-assets-api';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL, formatDateTime } from '@/components/dashboard/labels';
import { SaveToStudioButton } from '@/components/studio/SaveToStudioButton';
import { cn } from '@/lib/utils';

import { TokenIcon } from '@/components/ui/token-icon';
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

type ServiceDetailProps = {
  slug: string;
};

type UserInputOption = {
  value: string;
  label: string;
  disabled?: boolean;
  priceCoins?: number;
  hint?: string;
};

type UserInputField = {
  id: string;
  type: 'text' | 'textarea' | 'photo' | 'video' | 'select' | 'media-select' | 'avatar' | 'tier' | 'audio' | 'duration' | 'aspect_ratio' | 'music-select' | 'slides' | 'multiselect';
  label?: string;
  required?: boolean;
  requiredWhen?: { field: string; value: string };
  visibleWhen?: { field: string; value: string };
  defaultValue?: string;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  maxSizeMb?: number;
  maxDurationSec?: number;
  allowedFormats?: string[];
  options?: UserInputOption[];
  mediaKind?: string;
  mediaGroup?: string;
  allowStudioAvatars?: boolean;
  allowSystemLibrary?: boolean;
  durationOptions?: number[];
  defaultDuration?: number;
  maxSlides?: number;
  aspectOptions?: Array<'auto' | '9:16' | '16:9' | '1:1' | '4:3' | '3:4'>;
  defaultAspect?: 'auto' | '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
  allowUserUpload?: boolean;
  allowLibrary?: boolean;
};

type FormValues = Record<string, string>;
type FileValues = Record<string, File | undefined>;
type MediaAssetOption = { id: string; title: string; publicUrl: string; thumbnailUrl?: string | null; kind?: string; mimeType?: string };

// Category labels loaded from /api/public/service-categories via useGetServiceCategoriesQuery.

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function videoPreviewUrl(value?: string | null) {
  const url = mediaUrl(value)?.trim();
  if (!url) return null;
  return /^https?:\/\/.+\.mp4(?:[?#].*)?$/i.test(url) ? url : null;
}

function mediaSelectKey(kind: string, group?: string) {
  return group ? `${kind}::${group}` : kind;
}

function selectedVideoPreview(fields: UserInputField[], values: FormValues, mediaByKind: Record<string, MediaAssetOption[]>) {
  const mediaSelect = fields.find((field) => field.type === 'media-select' && field.mediaKind);
  if (mediaSelect?.mediaKind) {
    const asset = mediaByKind[mediaSelectKey(mediaSelect.mediaKind, mediaSelect.mediaGroup)]?.find((item) => item.id === values[mediaSelect.id]);
    return videoPreviewUrl(asset?.publicUrl);
  }
  const videoSelect = fields.find(
    (field) => field.type === 'select' && (field.options ?? []).some((option) => videoPreviewUrl(option.value)),
  );
  if (!videoSelect) return null;
  return videoPreviewUrl(values[videoSelect.id]);
}

function previewImage(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]) ?? '/mock_preview.png';
}

function parseCondition(value: unknown): { field: string; value: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.field !== 'string' || typeof record.value !== 'string') return undefined;
  return { field: record.field, value: record.value };
}

function fieldVisible(field: UserInputField, values: FormValues): boolean {
  if (!field.visibleWhen) return true;
  return values[field.visibleWhen.field] === field.visibleWhen.value;
}

function parseSlides(value?: string): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map((item) => (typeof item === 'string' ? item : ''));
  } catch {
    // ignore malformed JSON
  }
  return [];
}

function slideCount(fields: UserInputField[], values: FormValues): number {
  const slidesField = fields.find((field) => field.type === 'slides');
  if (!slidesField) return 0;
  return Math.max(1, parseSlides(values[slidesField.id]).length);
}

// Sum of selected option prices for a priced multiselect field (e.g. product-card outputs).
// Returns null when there is no priced multiselect field.
function multiselectPrice(fields: UserInputField[], values: FormValues): number | null {
  const field = fields.find(
    (item) => item.type === 'multiselect' && (item.options ?? []).some((option) => typeof option.priceCoins === 'number'),
  );
  if (!field) return null;
  const selected = new Set(parseSlides(values[field.id]));
  let sum = 0;
  for (const option of field.options ?? []) {
    if (!option.disabled && selected.has(option.value)) sum += option.priceCoins ?? 0;
  }
  return sum;
}

function parseFields(value: unknown): UserInputField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      type: typeof item.type === 'string' ? (item.type as UserInputField['type']) : 'text',
      label: typeof item.label === 'string' ? item.label : undefined,
      required: item.required === true,
      requiredWhen: parseCondition(item.requiredWhen),
      visibleWhen: parseCondition(item.visibleWhen),
      defaultValue: typeof item.defaultValue === 'string' ? item.defaultValue : undefined,
      hint: typeof item.hint === 'string' ? item.hint : undefined,
      placeholder: typeof item.placeholder === 'string' ? item.placeholder : undefined,
      maxLength: typeof item.maxLength === 'number' ? item.maxLength : undefined,
      maxSizeMb: typeof item.maxSizeMb === 'number' ? item.maxSizeMb : undefined,
      maxDurationSec: typeof item.maxDurationSec === 'number' ? item.maxDurationSec : undefined,
      allowedFormats: Array.isArray(item.allowedFormats)
        ? item.allowedFormats.filter((v): v is string => typeof v === 'string')
        : undefined,
      mediaKind: typeof item.mediaKind === 'string' ? item.mediaKind : undefined,
      mediaGroup: typeof item.mediaGroup === 'string' ? item.mediaGroup : undefined,
      allowStudioAvatars: typeof item.allowStudioAvatars === 'boolean' ? item.allowStudioAvatars : undefined,
      allowSystemLibrary: typeof item.allowSystemLibrary === 'boolean' ? item.allowSystemLibrary : undefined,
      durationOptions: Array.isArray(item.durationOptions)
        ? item.durationOptions.filter((v): v is number => typeof v === 'number')
        : undefined,
      defaultDuration: typeof item.defaultDuration === 'number' ? item.defaultDuration : undefined,
      maxSlides: typeof item.maxSlides === 'number' ? item.maxSlides : undefined,
      aspectOptions: Array.isArray(item.aspectOptions)
        ? (item.aspectOptions.filter((v) => typeof v === 'string') as UserInputField['aspectOptions'])
        : undefined,
      defaultAspect: typeof item.defaultAspect === 'string' ? (item.defaultAspect as UserInputField['defaultAspect']) : undefined,
      allowUserUpload: typeof item.allowUserUpload === 'boolean' ? item.allowUserUpload : undefined,
      allowLibrary: typeof item.allowLibrary === 'boolean' ? item.allowLibrary : undefined,
      options: Array.isArray(item.options)
        ? item.options
            .filter((option): option is Record<string, unknown> => !!option && typeof option === 'object' && !Array.isArray(option))
            .map((option) => ({
              value: String(option.value ?? ''),
              label: String(option.label ?? option.value ?? ''),
              disabled: option.disabled === true,
              priceCoins: typeof option.priceCoins === 'number' ? option.priceCoins : undefined,
              hint: typeof option.hint === 'string' ? option.hint : undefined,
            }))
        : undefined,
    }))
    .filter((item) => item.id && ['text', 'textarea', 'photo', 'video', 'select', 'media-select', 'avatar', 'tier', 'audio', 'duration', 'aspect_ratio', 'music-select', 'slides', 'multiselect'].includes(item.type));
}

function servicePrice(service: PublicService) {
  return service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens;
}

type ServiceTier = 'standard' | 'pro';

function tierPrice(service: PublicService, tier: ServiceTier) {
  return tier === 'standard'
    ? (service.priceCoinsStandard ?? service.priceCoinsPro ?? service.priceTokens)
    : (service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens);
}

function TierSelector({
  field,
  service,
  value,
  onChange,
}: {
  field: UserInputField;
  service: PublicService;
  value: ServiceTier;
  onChange: (tier: ServiceTier) => void;
}) {
  const options = field.options && field.options.length > 0
    ? field.options
    : [
        { value: 'standard', label: 'Стандарт' },
        { value: 'pro', label: 'Pro' },
      ];
  return (
    <div className="space-y-2">
      <Label>{field.label ?? 'Качество'}</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const tier: ServiceTier = option.value === 'standard' ? 'standard' : 'pro';
          const active = value === tier;
          const disabled = option.disabled === true;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(tier)}
              className={cn(
                'rounded-lg border p-3 text-left transition',
                disabled
                  ? 'cursor-not-allowed border-slate-800 bg-slate-950/50 opacity-50'
                  : active
                    ? 'border-amber-400 bg-amber-400/10'
                    : 'border-slate-700 bg-slate-950 hover:border-slate-500',
              )}
            >
              <div className="text-sm font-semibold text-slate-100">{option.label}</div>
              <div className="mt-1 text-xs font-bold text-amber-300">
                {disabled ? 'скоро' : `${tierPrice(service, tier)} коинов`}
              </div>
            </button>
          );
        })}
      </div>
      {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
    </div>
  );
}

function getErrorCode(error: unknown): string | undefined {
  return (error as { data?: { error?: { code?: string } } })?.data?.error?.code;
}

function getErrorMessage(error: unknown): string | undefined {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
}

const warningToastClass = 'border-amber-500 bg-amber-950 text-amber-50 shadow-2xl shadow-black/40';
const warningAlertClass = 'border-amber-500 bg-amber-950 text-amber-50 [&>svg]:text-amber-300';

const LAUNCH_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_TOKENS: 'На балансе недостаточно коинов для запуска услуги. Пополните баланс и попробуйте снова.',
  REQUIRED_FIELD_MISSING: 'Не заполнено обязательное поле. Проверьте фото и параметры услуги.',
  FILE_REQUIRED: 'Нужно загрузить файл для запуска услуги.',
  FILE_TOO_LARGE: 'Файл слишком большой. Загрузите файл меньшего размера.',
  UNSUPPORTED_FORMAT: 'Формат файла не поддерживается. Фото: JPG, PNG или WebP. Видео: MP4, WebM или MOV. Аудио: MP3, WAV или OGG.',
  INVALID_MEDIA_ASSET: 'Выбранный файл из Студии недоступен для этой услуги. Выберите другой файл или загрузите новый.',
  MEDIA_ASSET_NOT_FOUND: 'Выбранный файл из Студии не найден. Обновите страницу и выберите файл заново.',
  MEDIA_ASSET_NOT_ALLOWED: 'Этот файл нельзя использовать в выбранном поле. Выберите подходящее изображение из Студии.',
  SERVICE_NOT_FOUND: 'Услуга сейчас недоступна или скрыта из каталога.',
  QUEUE_UNAVAILABLE: getUserFriendlyError('QUEUE_UNAVAILABLE'),
  SERVICE_FORM_INVALID: 'Форма услуги настроена некорректно. Мы уже видим эту техническую ошибку.',
  PIPELINE_CONFIG_MISSING: 'Сценарий услуги не настроен. Запуск временно недоступен.',
  PIPELINE_CONFIG_INVALID: 'Сценарий услуги настроен некорректно. Запуск временно недоступен.',
};

function russianErrorFromRawMessage(message?: string) {
  const raw = message?.toLowerCase() ?? '';
  if (/violat|community guidelines|moderat|nsfw|content policy|policy violation|safety policy|unsafe content/.test(raw)) {
    return getUserFriendlyError('CONTENT_MODERATION');
  }
  if (/10001|upstream.*busy|too many requests|rate limit|try again later|temporar(?:y|ily).*busy|overloaded/.test(raw)) {
    return getUserFriendlyError('PIAPI_UPSTREAM_BUSY');
  }
  if (/queue unavailable|очеред/.test(raw)) return getUserFriendlyError('QUEUE_UNAVAILABLE');
  return null;
}

function unsupportedFormatMessage(message?: string) {
  const raw = message?.toLowerCase() ?? '';
  if (/video|uservideo/.test(raw)) {
    return 'Формат видео не поддерживается. Загрузите MP4, WebM или MOV. Для MP4 лучше использовать обычный H.264/AAC без редких кодеков.';
  }
  if (/audio|music/.test(raw)) {
    return 'Формат аудио не поддерживается. Загрузите MP3, WAV или OGG.';
  }
  if (/photo|image|face|portrait|friend|mother|father/.test(raw)) {
    return 'Формат фото не поддерживается. Загрузите JPG, PNG или WebP.';
  }
  return LAUNCH_ERROR_MESSAGES.UNSUPPORTED_FORMAT;
}

function launchErrorMessage(error: unknown) {
  const code = getErrorCode(error);
  if (code === 'UNSUPPORTED_FORMAT') return unsupportedFormatMessage(getErrorMessage(error));
  if (code && LAUNCH_ERROR_MESSAGES[code]) return LAUNCH_ERROR_MESSAGES[code];
  return russianErrorFromRawMessage(getErrorMessage(error))
    ?? (code ? getUserFriendlyError(code) : 'Запуск не выполнен из-за технической ошибки. Попробуйте ещё раз через несколько минут.');
}

function projectWarningMessage(project: ProjectListItem) {
  if (project.errorCode) return getUserFriendlyError(project.errorCode);
  return russianErrorFromRawMessage(project.errorMessage ?? undefined)
    ?? getUserFriendlyError(project.errorCode);
}

function fieldIsRequired(field: UserInputField, values: FormValues): boolean {
  if (field.requiredWhen) {
    if (values[field.requiredWhen.field] === field.requiredWhen.value) return true;
  }
  return field.required === true;
}

function validateClient(fields: UserInputField[], values: FormValues, files: FileValues) {
  const errors: string[] = [];
  for (const field of fields) {
    if (field.type === 'tier') continue;
    if (!fieldVisible(field, values)) continue;
    const required = fieldIsRequired(field, values);
    if (field.type === 'photo' || field.type === 'audio' || field.type === 'video') {
      if (required && !files[field.id] && !values[field.id]?.trim()) {
        errors.push(`Загрузите файл: ${field.label ?? field.id}`);
      }
      continue;
    }
    if (field.type === 'avatar') {
      if (required && !values[field.id]?.trim()) errors.push(`Выберите аватар: ${field.label ?? field.id}`);
      continue;
    }
    if (field.type === 'slides') {
      const arr = parseSlides(values[field.id]);
      if (required && (arr.length < 1 || arr.every((text) => !text.trim()))) {
        errors.push(`Заполните текст хотя бы одного слайда: ${field.label ?? field.id}`);
      }
      continue;
    }
    if (field.type === 'multiselect') {
      const arr = parseSlides(values[field.id]);
      if (required && arr.length < 1) errors.push(`Выберите хотя бы один вариант: ${field.label ?? field.id}`);
      continue;
    }
    const value = values[field.id]?.trim();
    if (required && !value) errors.push(`Заполните поле: ${field.label ?? field.id}`);
    if (field.maxLength && value && value.length > field.maxLength) {
      errors.push(`Поле ${field.label ?? field.id} слишком длинное`);
    }
  }
  return errors;
}

type PhotoSourceTab = 'upload' | 'studio' | 'library';

function assetIdFromRef(value?: string) {
  return value?.match(/^asset:([a-zA-Z0-9_-]+)$/)?.[1] ?? null;
}

function isImageAsset(asset: { mimeType?: string | null }) {
  return !asset.mimeType || asset.mimeType.startsWith('image/');
}

function flattenStudioAssetChoices(items: UserMediaAsset[]): MediaAssetOption[] {
  return items.flatMap((asset) => {
    const choices: MediaAssetOption[] = isImageAsset(asset) ? [asset] : [];
    for (const [index, variation] of (asset.variations ?? []).entries()) {
      if (!isImageAsset(variation)) continue;
      choices.push({
        ...variation,
        title: `${asset.title} · Вариация ${index + 1}`,
        kind: asset.kind,
      });
    }
    return choices;
  });
}

function useFileObjectUrl(file?: File) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  return url;
}

function PhotoReferencePreview({
  label,
  file,
  url,
  onRemove,
}: {
  label: string;
  file?: File;
  url?: string | null;
  onRemove: () => void;
}) {
  const fileUrl = useFileObjectUrl(file);
  const previewUrl = fileUrl ?? mediaUrl(url);

  return (
    <div className="group relative h-24 w-24 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={label} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-slate-600">
          <ImagePlus className="h-7 w-7" />
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-950/80 text-white opacity-0 transition hover:bg-slate-800 group-hover:opacity-100"
        aria-label={`Удалить ${label}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="absolute inset-x-0 bottom-0 bg-slate-950/75 px-1.5 py-1 text-[10px] font-medium text-white">
        <span className="block truncate">{label}</span>
      </div>
    </div>
  );
}

function ServicePhotoReferencesGroup({
  fields,
  values,
  files,
  onValueChange,
  onFileChange,
}: {
  fields: UserInputField[];
  values: FormValues;
  files: FileValues;
  onValueChange: (id: string, value: string) => void;
  onFileChange: (id: string, file?: File) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const studioEnabled = fields.some((field) => field.allowStudioAvatars !== false);
  const libraryEnabled = fields.some((field) => field.allowSystemLibrary === true);
  const avatars = useListUserMediaAssetsQuery({ kind: 'user-avatar', limit: 100 }, { skip: !studioEnabled });
  const publicAssets = useGetPublicMediaAssetsQuery(
    { kind: 'preview-image', active: true },
    { skip: !libraryEnabled },
  );
  const studioAssets = useMemo(
    () => flattenStudioAssetChoices(avatars.data?.items ?? []),
    [avatars.data?.items],
  );
  const libraryAssets = useMemo(
    () => (publicAssets.data?.assets ?? []).filter(isImageAsset),
    [publicAssets.data?.assets],
  );
  const allAssets = useMemo(
    () => [...studioAssets, ...libraryAssets],
    [studioAssets, libraryAssets],
  );

  const items = fields.map((field) => {
    const asset = allAssets.find((item) => item.id === assetIdFromRef(values[field.id]));
    const rawUrl = asset?.thumbnailUrl || asset?.publicUrl || values[field.id];
    return {
      field,
      file: files[field.id],
      value: values[field.id],
      asset,
      previewUrl: rawUrl,
      hasReference: Boolean(files[field.id] || values[field.id]?.trim()),
    };
  });
  const filled = items.filter((item) => item.hasReference);
  const nextField = items.find((item) => !item.hasReference)?.field;
  const canAdd = Boolean(nextField);
  const title = fields.length > 1 ? 'Референсы' : (fields[0]?.label ?? 'Фото');
  const firstRequired = fields.some((field) => field.required);
  const groupHint = fields.find((field) => field.hint)?.hint;
  const nextInputId = nextField ? `${nextField.id}-reference-upload` : undefined;

  const clearField = (field: UserInputField) => {
    onValueChange(field.id, '');
    onFileChange(field.id, undefined);
  };

  const selectAsset = (field: UserInputField, asset: MediaAssetOption) => {
    onFileChange(field.id, undefined);
    onValueChange(field.id, `asset:${asset.id}`);
    setPickerOpen(false);
  };

  const selectFile = (field: UserInputField, file?: File) => {
    onValueChange(field.id, '');
    onFileChange(field.id, file);
    if (file) setPickerOpen(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <Label>
          {title} {firstRequired ? <span className="text-amber-300">*</span> : null}
        </Label>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {filled.length}/{fields.length} добавлено
        </p>
        {groupHint && <p className="mt-1 text-xs leading-5 text-amber-300/80">{groupHint}</p>}
      </div>

      <div className="flex flex-wrap gap-3">
        {filled.map((item) => (
          <PhotoReferencePreview
            key={item.field.id}
            label={item.field.label ?? item.field.id}
            file={item.file}
            url={item.previewUrl}
            onRemove={() => clearField(item.field)}
          />
        ))}

        {canAdd && nextField && (
          <label
            htmlFor={nextInputId}
            className={cn(
              'grid h-24 w-24 cursor-pointer place-items-center rounded-md border border-dashed border-slate-700 bg-slate-950/60 text-center transition hover:border-amber-400',
              filled.length > 0 ? 'text-slate-300' : 'text-slate-200',
            )}
          >
            <div>
              {filled.length > 0 ? (
                <Plus className="mx-auto h-7 w-7 text-slate-400" />
              ) : (
                <ImagePlus className="mx-auto h-7 w-7 text-slate-500" />
              )}
              <div className="mt-2 px-2 text-xs font-medium">
                {filled.length > 0 ? 'Добавить' : 'Загрузить фото'}
              </div>
              <div className="mt-0.5 max-w-[5.5rem] truncate px-2 text-[10px] text-slate-500">
                {nextField.label ?? nextField.id}
              </div>
            </div>
            <Input
              id={nextInputId}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => selectFile(nextField, event.target.files?.[0])}
            />
          </label>
        )}
      </div>

      {canAdd && nextField && studioEnabled && (
        <Button
          type="button"
          variant={pickerOpen ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPickerOpen((current) => !current)}
          className={cn('w-full justify-center gap-2', pickerOpen && 'bg-violet-600 hover:bg-violet-500')}
        >
          <Library className="h-4 w-4 shrink-0" />
          Добавить из Студии
        </Button>
      )}

      {pickerOpen && canAdd && nextField && (
        <AssetChoiceGrid
          isLoading={avatars.isLoading || publicAssets.isLoading}
          items={[
            ...(nextField.allowStudioAvatars !== false ? studioAssets : []),
            ...(nextField.allowSystemLibrary === true ? libraryAssets : []),
          ]}
          empty={
            <div className="text-center">
              <div className="text-sm text-slate-400">В Студии пока нет подходящих аватаров.</div>
              <Button asChild variant="outline" size="sm" className="mt-3 border-slate-700 bg-slate-950">
                <Link href="/studio">Создать первый аватар</Link>
              </Button>
            </div>
          }
          onSelect={(asset) => selectAsset(nextField, asset)}
        />
      )}
    </div>
  );
}

function ServicePhotoInput({
  field,
  label,
  required,
  value,
  file,
  onValueChange,
  onFileChange,
}: {
  field: UserInputField;
  label: string;
  required: ReactNode;
  value?: string;
  file?: File;
  onValueChange: (id: string, value: string) => void;
  onFileChange: (id: string, file?: File) => void;
}) {
  const uploadEnabled = field.type === 'photo';
  const studioEnabled = field.allowStudioAvatars !== false;
  const libraryEnabled = field.type === 'photo' && field.allowSystemLibrary === true;
  const defaultTab: PhotoSourceTab = uploadEnabled ? 'upload' : 'studio';
  const [tab, setTab] = useState<PhotoSourceTab>(defaultTab);
  const avatars = useListUserMediaAssetsQuery({ kind: 'user-avatar', limit: 100 }, { skip: !studioEnabled });
  const publicAssets = useGetPublicMediaAssetsQuery(
    { kind: 'preview-image', active: true },
    { skip: !libraryEnabled },
  );

  const studioAssets = useMemo(
    () => flattenStudioAssetChoices(avatars.data?.items ?? []),
    [avatars.data?.items],
  );
  const libraryAssets = useMemo(
    () => (publicAssets.data?.assets ?? []).filter(isImageAsset),
    [publicAssets.data?.assets],
  );
  const allAssets = useMemo(
    () => [...studioAssets, ...libraryAssets],
    [studioAssets, libraryAssets],
  );
  const selectedAsset = allAssets.find((asset) => asset.id === assetIdFromRef(value));

  const selectAsset = (asset: MediaAssetOption) => {
    onFileChange(field.id, undefined);
    onValueChange(field.id, `asset:${asset.id}`);
  };

  const selectFile = (next?: File) => {
    onValueChange(field.id, '');
    onFileChange(field.id, next);
    if (next) setTab('upload');
  };

  const tabs: Array<{ id: PhotoSourceTab; label: string }> = [];
  if (studioEnabled) tabs.push({ id: 'studio', label: 'Добавить из Студии' });
  if (libraryEnabled) tabs.push({ id: 'library', label: 'Из библиотеки' });

  return (
    <div className="space-y-3">
      <Label htmlFor={field.id}>{label} {required}</Label>
      {tabs.length > 0 && uploadEnabled && (
        <div className="grid gap-2">
          {tabs.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={tab === item.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTab((current) => (uploadEnabled && current === item.id ? 'upload' : item.id))}
              className={cn('w-full justify-center gap-2', tab === item.id && 'bg-violet-600 hover:bg-violet-500')}
            >
              <Library className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Button>
          ))}
        </div>
      )}

      {selectedAsset && (
        <div className="flex items-center gap-3 rounded-lg border border-violet-500/40 bg-violet-500/10 p-3">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedAsset.thumbnailUrl || selectedAsset.publicUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{selectedAsset.title}</div>
            <div className="text-xs text-violet-200">
              {selectedAsset.kind === 'preview-image' ? 'Библиотека сайта' : 'Аватар из Студии'}
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onValueChange(field.id, '')}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {tab === 'studio' && studioEnabled && (
        <AssetChoiceGrid
          isLoading={avatars.isLoading}
          items={studioAssets}
          empty={
            <div className="text-center">
              <div className="text-sm text-slate-400">В Студии пока нет аватаров.</div>
              <Button asChild variant="outline" size="sm" className="mt-3 border-slate-700 bg-slate-950">
                <Link href="/studio">Создать первый аватар</Link>
              </Button>
            </div>
          }
          onSelect={selectAsset}
        />
      )}

      {tab === 'library' && libraryEnabled && (
        <AssetChoiceGrid
          isLoading={publicAssets.isLoading}
          items={libraryAssets}
          empty={<div className="text-sm text-slate-400">В системной библиотеке нет подходящих изображений.</div>}
          onSelect={selectAsset}
        />
      )}

      {uploadEnabled && (
        <label
          htmlFor={field.id}
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-5 text-center transition hover:border-amber-400"
        >
          <ImagePlus className="h-8 w-8 text-slate-500" />
          <span className="mt-3 text-sm font-medium text-slate-200">
            {file ? file.name : 'Загрузить фото'}
          </span>
          {field.hint && <span className="mt-1 text-xs text-slate-500">{field.hint}</span>}
          <Input
            id={field.id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}

function AssetChoiceGrid({
  items,
  isLoading,
  empty,
  onSelect,
}: {
  items: MediaAssetOption[];
  isLoading?: boolean;
  empty: ReactNode;
  onSelect: (asset: MediaAssetOption) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-md" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-4">
        {empty}
      </div>
    );
  }
  return (
    <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-2 sm:grid-cols-3">
      {items.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => onSelect(asset)}
          className="overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-left transition hover:border-violet-500"
        >
          <div className="relative aspect-square bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.thumbnailUrl || asset.publicUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div className="truncate p-2 text-xs text-slate-100">{asset.title}</div>
        </button>
      ))}
    </div>
  );
}

function ServiceAudioInput({
  field,
  label,
  required,
  value,
  file,
  onValueChange,
  onFileChange,
}: {
  field: UserInputField;
  label: string;
  required: ReactNode;
  value?: string;
  file?: File;
  onValueChange: (id: string, value: string) => void;
  onFileChange: (id: string, file?: File) => void;
}) {
  const uploadEnabled = field.allowUserUpload !== false;
  const libraryEnabled = field.allowLibrary === true;
  const defaultTab: 'upload' | 'library' = uploadEnabled ? 'upload' : 'library';
  const [tab, setTab] = useState<'upload' | 'library'>(defaultTab);
  const library = useGetPublicMediaAssetsQuery(
    { kind: field.mediaKind ?? 'background-music', active: true },
    { skip: !libraryEnabled },
  );
  const tracks = library.data?.assets ?? [];

  return (
    <div className="space-y-3">
      <Label htmlFor={field.id}>{label} {required}</Label>
      {uploadEnabled && libraryEnabled && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant={tab === 'upload' ? 'default' : 'outline'} size="sm" onClick={() => setTab('upload')}>
            Загрузить свой
          </Button>
          <Button type="button" variant={tab === 'library' ? 'default' : 'outline'} size="sm" onClick={() => setTab('library')}>
            Из библиотеки
          </Button>
        </div>
      )}

      {tab === 'upload' && uploadEnabled && (
        <label
          htmlFor={field.id}
          className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-4 text-center transition hover:border-amber-400"
        >
          <span className="text-sm font-medium text-slate-200">
            {file ? file.name : 'Выбрать mp3 / wav / ogg'}
          </span>
          {field.hint && <span className="mt-1 text-xs text-slate-500">{field.hint}</span>}
          <Input
            id={field.id}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg"
            className="hidden"
            onChange={(event) => {
              const next = event.target.files?.[0];
              onValueChange(field.id, '');
              onFileChange(field.id, next);
            }}
          />
        </label>
      )}

      {tab === 'library' && libraryEnabled && (
        <div className="space-y-2">
          <select
            value={value ?? ''}
            onChange={(event) => {
              onFileChange(field.id, undefined);
              onValueChange(field.id, event.target.value);
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— без музыки —</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.title}
              </option>
            ))}
          </select>
          {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
        </div>
      )}
    </div>
  );
}

function ServiceVideoInput({
  field,
  label,
  required,
  file,
  onFileChange,
}: {
  field: UserInputField;
  label: string;
  required: ReactNode;
  file?: File;
  onFileChange: (id: string, file?: File) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const maxMb = field.maxSizeMb ?? 50;
  const maxDur = field.maxDurationSec;
  const previewUrl = useFileObjectUrl(file);

  const selectFile = (next?: File) => {
    setError(null);
    if (!next) {
      onFileChange(field.id, undefined);
      return;
    }
    if (next.size > maxMb * 1024 * 1024) {
      setError(`Файл больше ${maxMb} МБ`);
      onFileChange(field.id, undefined);
      return;
    }
    if (maxDur) {
      const url = URL.createObjectURL(next);
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        if (Number.isFinite(probe.duration) && probe.duration > maxDur + 0.5) {
          setError(`Видео длиннее ${maxDur} сек. Обрежьте ролик и загрузите снова.`);
          onFileChange(field.id, undefined);
        } else {
          onFileChange(field.id, next);
        }
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        onFileChange(field.id, next);
      };
      probe.src = url;
    } else {
      onFileChange(field.id, next);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>{label} {required}</Label>
      {file ? (
        <div className="flex items-center gap-3">
          <div className="relative h-24 w-24 overflow-hidden rounded-md border border-slate-700 bg-slate-950">
            {previewUrl ? (
              <video src={previewUrl} muted preload="metadata" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-slate-600">
                <Video className="h-7 w-7" />
              </div>
            )}
            <button
              type="button"
              onClick={() => onFileChange(field.id, undefined)}
              className="absolute right-1 top-1 inline-flex h-6 w-6 items-center justify-center rounded-md bg-slate-950/80 text-white transition hover:bg-slate-800"
              aria-label={`Удалить ${label}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium text-slate-100">{file.name}</div>
            <div className="mt-1 text-xs text-slate-500">
              MP4/WebM/MOV, до {maxMb} МБ{maxDur ? `, до ${maxDur} сек` : ''}
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={field.id}
          className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-5 text-center transition hover:border-amber-400"
        >
          <Video className="h-8 w-8 text-slate-500" />
          <span className="mt-3 text-sm font-medium text-slate-200">Загрузить видео</span>
          <span className="mt-1 text-xs text-slate-500">
            MP4/WebM/MOV, до {maxMb} МБ{maxDur ? `, до ${maxDur} сек` : ''}
          </span>
          <Input
            id={field.id}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />
        </label>
      )}
      {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SlidesInput({
  field,
  label,
  required,
  value,
  onValueChange,
}: {
  field: UserInputField;
  label: string;
  required: ReactNode;
  value?: string;
  onValueChange: (id: string, value: string) => void;
}) {
  const max = field.maxSlides ?? 10;
  const slides = useMemo(() => {
    const parsed = parseSlides(value);
    return parsed.length > 0 ? parsed : ['', '', ''];
  }, [value]);
  const count = slides.length;

  const commit = (next: string[]) => onValueChange(field.id, JSON.stringify(next));
  const setCount = (n: number) => {
    const next = [...slides];
    if (n > next.length) {
      while (next.length < n) next.push('');
    } else {
      next.length = n;
    }
    commit(next);
  };
  const setText = (index: number, text: string) => {
    const next = [...slides];
    next[index] = text;
    commit(next);
  };

  return (
    <div className="space-y-3">
      <Label>{label} {required}</Label>
      <div className="space-y-1.5">
        <div className="text-xs text-slate-400">Число слайдов</div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={cn(
                'h-9 w-9 rounded-md border text-sm font-semibold transition',
                count === n
                  ? 'border-amber-400 bg-amber-400 text-slate-950'
                  : 'border-slate-700 bg-slate-950 text-slate-100 hover:border-slate-500',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2.5">
        {slides.map((text, index) => (
          <div key={index} className="space-y-1">
            <Label className="text-xs text-slate-400">Текст слайда {index + 1}</Label>
            <Textarea
              value={text}
              rows={2}
              maxLength={field.maxLength ?? 600}
              placeholder={`Текст для слайда ${index + 1} (можно оставить пустым)`}
              onChange={(event) => setText(index, event.target.value)}
            />
          </div>
        ))}
      </div>
      {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
    </div>
  );
}

function MultiSelectInput({
  field,
  label,
  required,
  value,
  onValueChange,
}: {
  field: UserInputField;
  label: string;
  required: ReactNode;
  value?: string;
  onValueChange: (id: string, value: string) => void;
}) {
  const options = field.options ?? [];
  const selected = parseSlides(value);
  const toggle = (optionValue: string) => {
    const set = new Set(selected);
    if (set.has(optionValue)) set.delete(optionValue);
    else set.add(optionValue);
    const ordered = options.map((option) => option.value).filter((optionValue2) => set.has(optionValue2));
    onValueChange(field.id, JSON.stringify(ordered));
  };
  return (
    <div className="space-y-2">
      <Label>{label} {required}</Label>
      <div className="space-y-2">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const disabled = option.disabled === true;
          return (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && toggle(option.value)}
              className={cn(
                'flex w-full items-center gap-3 rounded-md border p-3 text-left transition',
                disabled
                  ? 'cursor-not-allowed border-slate-800 bg-slate-950/50 opacity-50'
                  : checked
                    ? 'border-amber-400 bg-amber-400/10'
                    : 'border-slate-700 bg-slate-950 hover:border-slate-500',
              )}
            >
              <span
                className={cn(
                  'grid h-5 w-5 shrink-0 place-items-center rounded border',
                  checked ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-600 text-transparent',
                )}
              >
                <Check className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-100">
                  {option.label}{disabled ? ' · скоро' : ''}
                </span>
                {option.hint && <span className="mt-0.5 block text-xs leading-4 text-slate-500">{option.hint}</span>}
              </span>
              {typeof option.priceCoins === 'number' && !disabled && (
                <span className="shrink-0 text-xs font-bold text-amber-300">{option.priceCoins} коинов</span>
              )}
            </button>
          );
        })}
      </div>
      {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
    </div>
  );
}

function FieldControl({
  field,
  value,
  file,
  mediaOptions,
  onValueChange,
  onFileChange,
}: {
  field: UserInputField;
  value?: string;
  file?: File;
  mediaOptions: Record<string, MediaAssetOption[]>;
  onValueChange: (id: string, value: string) => void;
  onFileChange: (id: string, file?: File) => void;
}) {
  if (field.type === 'tier') return null;

  const label = field.label ?? field.id;
  const required = field.required ? <span className="text-amber-300">*</span> : null;

  if (field.type === 'photo') {
    return (
      <ServicePhotoInput
        field={field}
        label={label}
        required={required}
        file={file}
        value={value}
        onValueChange={onValueChange}
        onFileChange={onFileChange}
      />
    );
  }

  if (field.type === 'video') {
    return (
      <ServiceVideoInput
        field={field}
        label={label}
        required={required}
        file={file}
        onFileChange={onFileChange}
      />
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <Textarea
          id={field.id}
          value={value ?? ''}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => onValueChange(field.id, event.target.value)}
        />
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <select
          id={field.id}
          value={value ?? ''}
          onChange={(event) => onValueChange(field.id, event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Выберите вариант</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'media-select') {
    const options = field.mediaKind ? mediaOptions[mediaSelectKey(field.mediaKind, field.mediaGroup)] ?? [] : [];
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <select
          id={field.id}
          value={value ?? ''}
          onChange={(event) => onValueChange(field.id, event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Выберите вариант</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'avatar') {
    return (
      <ServicePhotoInput
        field={{ ...field, allowStudioAvatars: true, allowSystemLibrary: false }}
        label={label}
        required={required}
        value={value}
        onValueChange={onValueChange}
        onFileChange={onFileChange}
      />
    );
  }

  if (field.type === 'audio') {
    return (
      <ServiceAudioInput
        field={field}
        label={label}
        required={required}
        value={value}
        file={file}
        onValueChange={onValueChange}
        onFileChange={onFileChange}
      />
    );
  }

  if (field.type === 'music-select') {
    return (
      <ServiceAudioInput
        field={{ ...field, allowUserUpload: false, allowLibrary: true, mediaKind: field.mediaKind ?? 'background-music' }}
        label={label}
        required={required}
        value={value}
        file={file}
        onValueChange={onValueChange}
        onFileChange={onFileChange}
      />
    );
  }

  if (field.type === 'slides') {
    return (
      <SlidesInput
        field={field}
        label={label}
        required={required}
        value={value}
        onValueChange={onValueChange}
      />
    );
  }

  if (field.type === 'multiselect') {
    return (
      <MultiSelectInput
        field={field}
        label={label}
        required={required}
        value={value}
        onValueChange={onValueChange}
      />
    );
  }

  if (field.type === 'duration') {
    const options = field.durationOptions && field.durationOptions.length > 0 ? field.durationOptions : [5, 8, 10];
    const current = value ?? String(field.defaultDuration ?? options[0]);
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onValueChange(field.id, String(option))}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-semibold transition',
                String(option) === current
                  ? 'border-amber-400 bg-amber-400 text-slate-950'
                  : 'border-slate-700 bg-slate-950 text-slate-100 hover:border-slate-500',
              )}
            >
              {option} сек
            </button>
          ))}
        </div>
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'aspect_ratio') {
    const options = field.aspectOptions && field.aspectOptions.length > 0
      ? field.aspectOptions
      : (['auto', '9:16', '16:9', '1:1'] as const);
    const current = value ?? field.defaultAspect ?? options[0];
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 4)}, minmax(0, 1fr))` }}>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onValueChange(field.id, option)}
              className={cn(
                'rounded-md border px-3 py-2 text-xs font-semibold transition',
                option === current
                  ? 'border-amber-400 bg-amber-400 text-slate-950'
                  : 'border-slate-700 bg-slate-950 text-slate-100 hover:border-slate-500',
              )}
            >
              {option === 'auto' ? 'Авто' : option}
            </button>
          ))}
        </div>
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>{label} {required}</Label>
      <Input
        id={field.id}
        value={value ?? ''}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={(event) => onValueChange(field.id, event.target.value)}
      />
      {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
    </div>
  );
}

type ServiceDetailView = 'service' | 'generations';

function isActiveProjectStatus(status?: ProjectStatus) {
  return status === 'PENDING' || status === 'PROCESSING';
}

function creativeProgressMessage(progress: number) {
  if (progress < 12) return 'Нейронка раскладывает идею по пикселям...';
  if (progress < 32) return 'Ищем лучший свет и настроение...';
  if (progress < 58) return 'Собираем детали в цельный кадр...';
  if (progress < 82) return 'Полируем результат без лишнего шума...';
  return 'Финальные штрихи, почти готово...';
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

function projectOutputUrl(project: ProjectListItem) {
  return mediaUrl(project.resultVideo ?? project.resultImage ?? project.resultThumbnail);
}

function projectPosterUrl(project: ProjectListItem) {
  return mediaUrl(project.resultThumbnail ?? project.resultImage);
}

function projectFallbackPreviewUrl(project: ProjectListItem) {
  return mediaUrl(project.resultThumbnail ?? project.resultImage ?? project.resultVideo ?? project.inputImages[0]);
}

function projectServicePreviewUrl(project: ProjectListItem) {
  const service = project.service;
  if (service?.previewMode === 'video' && service.previewVideo) return null;
  return mediaUrl(service?.previewImage ?? service?.coverImage ?? service?.galleryImages?.[0] ?? null)
    ?? projectFallbackPreviewUrl(project);
}

function projectServicePreviewVideoUrl(project: ProjectListItem) {
  const service = project.service;
  if (service?.previewMode === 'image') return null;
  return mediaUrl(service?.previewVideo ?? null);
}

function GenerationServiceThumb({ project }: { project: ProjectListItem }) {
  const previewUrl = projectServicePreviewUrl(project);
  const previewVideoUrl = projectServicePreviewVideoUrl(project);
  return (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-800 bg-slate-950">
      {previewVideoUrl ? (
        <video src={previewVideoUrl} muted preload="metadata" className="h-full w-full object-cover" />
      ) : previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt={project.service?.title ?? project.title} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full place-items-center text-slate-600">
          <Video className="h-6 w-6" />
        </div>
      )}
    </div>
  );
}

function GenerationPreview({
  project,
  expanded,
  onOpenResult,
}: {
  project: ProjectListItem;
  expanded: boolean;
  onOpenResult: () => void;
}) {
  const resultUrl = projectOutputUrl(project);
  const posterUrl = projectPosterUrl(project);
  const previewUrl = projectServicePreviewUrl(project);
  const previewVideoUrl = projectServicePreviewVideoUrl(project);
  const isResultVideo = !!resultUrl && isVideoUrl(resultUrl);

  if (project.status === 'COMPLETED' && resultUrl) {
    return (
      <div className="group relative overflow-hidden rounded-md border border-slate-800 bg-slate-950">
        {isResultVideo ? (
          <video
            src={resultUrl}
            poster={posterUrl ?? undefined}
            controls={expanded}
            muted={!expanded}
            preload="metadata"
            className={cn('w-full bg-black object-contain', expanded ? 'max-h-[520px]' : 'h-32')}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resultUrl}
            alt="Результат генерации"
            className={cn('w-full cursor-zoom-in object-contain', expanded ? 'max-h-[520px]' : 'h-32')}
            onClick={onOpenResult}
          />
        )}
        <button
          type="button"
          onClick={onOpenResult}
          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-black/55 text-white opacity-0 backdrop-blur transition hover:bg-black/75 focus:opacity-100 group-hover:opacity-100"
          title="Открыть на весь экран"
          aria-label="Открыть на весь экран"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (previewVideoUrl || previewUrl) {
    return (
      <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-950">
        {previewVideoUrl ? (
          <video src={previewVideoUrl} muted preload="metadata" className={cn('w-full object-cover', expanded ? 'max-h-72' : 'h-24')} />
        ) : previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={project.service?.title ?? project.title} className={cn('w-full object-cover', expanded ? 'max-h-72' : 'h-24')} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid h-28 place-items-center rounded-md border border-slate-800 bg-slate-950 text-slate-600">
      <Video className="h-8 w-8" />
    </div>
  );
}

function GenerationResultLightbox({
  project,
  onClose,
}: {
  project: ProjectListItem;
  onClose: () => void;
}) {
  const resultUrl = projectOutputUrl(project);
  const videoUrl = mediaUrl(project.resultVideo);
  const imageUrl = mediaUrl(project.resultImage ?? project.resultThumbnail);
  const posterUrl = projectPosterUrl(project);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === 'undefined' || !resultUrl) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-end gap-2 p-3" onClick={(event) => event.stopPropagation()}>
        <Button asChild size="sm" className="bg-amber-500 text-slate-950 hover:bg-amber-400">
          <a href={resultUrl} download target="_blank" rel="noopener">
            <Download className="h-4 w-4" />
            Скачать
          </a>
        </Button>
        <Button type="button" variant="outline" size="icon" className="border-white/20 bg-white/10 text-white hover:bg-white/20" onClick={onClose} aria-label="Закрыть">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6">
        {videoUrl ? (
          <video
            src={videoUrl}
            poster={posterUrl ?? undefined}
            controls
            autoPlay
            className="max-h-full max-w-full rounded-md"
            onClick={(event) => event.stopPropagation()}
          />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="Результат генерации"
            className="max-h-full max-w-full rounded-md object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function GenerationProgress({ project, compact = false }: { project: ProjectListItem; compact?: boolean }) {
  const progress = Math.max(0, Math.min(100, project.progress ?? 0));
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-3'}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={cn('flex min-w-0 items-center gap-2 font-medium', compact ? 'text-amber-200' : 'text-slate-100')}>
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />
          <span className="truncate">{creativeProgressMessage(progress)}</span>
        </span>
        <span className="shrink-0 text-slate-400">{progress}%</span>
      </div>
      <Progress value={progress} />
      {!compact && (
        <p className="text-sm leading-6 text-slate-400">
          Можно закрыть страницу: генерация продолжится, а результат появится здесь автоматически.
        </p>
      )}
    </div>
  );
}

function GenerationWarning({ project }: { project: ProjectListItem }) {
  return (
    <Alert className={warningAlertClass}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Генерация не выполнена</AlertTitle>
      <AlertDescription>
        <p>{projectWarningMessage(project)}</p>
      </AlertDescription>
    </Alert>
  );
}

function projectResultAssets(project: ProjectListItem): Array<{ type: 'image' | 'video'; url: string; label?: string }> {
  const raw = (project as unknown as { resultAssets?: unknown }).resultAssets;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is { type?: unknown; url?: unknown; label?: unknown } => !!item && typeof item === 'object')
    .filter((item) => typeof item.url === 'string')
    .map((item) => ({
      type: item.type === 'video' ? ('video' as const) : ('image' as const),
      url: item.url as string,
      ...(typeof item.label === 'string' ? { label: item.label } : {}),
    }));
}

function GenerationGallery({ assets }: { assets: Array<{ type: 'image' | 'video'; url: string; label?: string }> }) {
  const labeled = assets.some((asset) => asset.label);
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-slate-200">{labeled ? 'Результаты' : 'Слайды'} ({assets.length})</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {assets.map((asset, index) => {
          const url = mediaUrl(asset.url) ?? asset.url;
          return (
            <div key={index} className="group relative overflow-hidden rounded-md border border-slate-800 bg-slate-950">
              {asset.type === 'video' ? (
                <video src={url} controls preload="metadata" className="w-full bg-black" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={asset.label ?? `Слайд ${index + 1}`} className="w-full object-cover" />
              )}
              <div className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {asset.label ?? index + 1}
              </div>
              <a
                href={url}
                download
                target="_blank"
                rel="noopener"
                className="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/65 text-white opacity-0 transition hover:bg-black/85 group-hover:opacity-100"
                title={`Скачать слайд ${index + 1}`}
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GenerationCard({
  project,
  expanded,
  onToggle,
}: {
  project: ProjectListItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isActive = isActiveProjectStatus(project.status);
  const resultUrl = projectOutputUrl(project);
  const galleryAssets = projectResultAssets(project);
  const isGallery = project.status === 'COMPLETED' && galleryAssets.length > 1;

  return (
    <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left transition hover:bg-slate-800/60"
      >
        <div className="mt-0.5 shrink-0 text-slate-400">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <GenerationServiceThumb project={project} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">{project.title}</h3>
            <Badge className={cn('rounded-md', PROJECT_STATUS_COLOR[project.status])}>
              {PROJECT_STATUS_LABEL[project.status]}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-slate-500">{formatDateTime(project.createdAt)}</div>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500">{project.tokensCost} коинов</div>
      </button>

      {!expanded && isActive && (
        <div className="border-t border-slate-800 px-4 pb-4">
          <GenerationProgress project={project} compact />
        </div>
      )}

      {expanded && (
        <div className="space-y-4 border-t border-slate-800 p-4">
          {isGallery ? (
            <GenerationGallery assets={galleryAssets} />
          ) : (
            <GenerationPreview project={project} expanded onOpenResult={() => setLightboxOpen(true)} />
          )}

          {isActive && <GenerationProgress project={project} />}

          {project.status === 'FAILED' && <GenerationWarning project={project} />}

          {project.status === 'COMPLETED' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              {resultUrl && (
                <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                  <a href={resultUrl} download target="_blank" rel="noopener">
                    <Download className="h-4 w-4" />
                    Скачать
                  </a>
                </Button>
              )}
              <SaveToStudioButton projectId={project.id} defaultTitle={project.title} />
            </div>
          )}
        </div>
      )}

      {lightboxOpen && <GenerationResultLightbox project={project} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}

function GenerationsPanel({
  projects,
  isLoading,
  expandedId,
  onExpandedChange,
}: {
  projects: ProjectListItem[];
  isLoading: boolean;
  expandedId: string | null;
  onExpandedChange: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-20 rounded-lg" />
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-slate-800 bg-slate-950/60 p-8 text-center">
        <div>
          <Sparkles className="mx-auto h-10 w-10 text-slate-600" />
          <h2 className="mt-4 text-xl font-bold">Генераций пока нет</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Запустите услугу справа, и прогресс появится здесь без перехода на отдельную страницу.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => (
        <GenerationCard
          key={project.id}
          project={project}
          expanded={expandedId === project.id}
          onToggle={() => onExpandedChange(project.id)}
        />
      ))}
    </div>
  );
}

function getFileCriteriaItems(fields: UserInputField[]) {
  const hasPhoto = fields.some((field) => field.type === 'photo' || field.type === 'avatar');
  const hasVideo = fields.some((field) => field.type === 'video');
  const hasAudio = fields.some((field) => field.type === 'audio');
  const items: string[] = [];

  if (hasPhoto) {
    items.push('Лицо хорошо видно: без сильного размытия, тёмных очков, масок и резких теней.');
    items.push('Лучше всего работает портрет анфас или лёгкий поворот, с естественным светом и без тяжёлых фильтров.');
    items.push('Для нескольких людей используйте отдельное фото для каждого человека: так перенос лиц будет точнее.');
  }
  if (hasVideo) {
    items.push('Видео должно быть коротким, стабильным и без сильной тряски; главный человек должен быть виден в кадре.');
  }
  if (hasAudio) {
    items.push('Музыку лучше загружать без перегруза по громкости, в MP3/WAV/OGG, чтобы финальный звук не хрипел.');
  }
  if (items.length === 0) {
    items.push('Чем чище исходные материалы и понятнее параметры, тем стабильнее будет результат.');
  }
  return items;
}

// Подсказки спрятаны под значок информации: на ПК показываются по наведению,
// на телефоне — по тапу. Так форма остаётся компактной, а советы под рукой.
function FileCriteriaInfo({ fields }: { fields: UserInputField[] }) {
  const items = getFileCriteriaItems(fields);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-300 transition hover:border-amber-400 hover:text-amber-300"
        aria-label="Как получить чистый результат"
        aria-expanded={open}
      >
        <Info className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-9 z-50 w-72 rounded-lg border border-slate-800 bg-slate-950 p-4 text-left shadow-2xl shadow-black/50 sm:w-80"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-amber-400" />
            Чтобы результат был чище
          </div>
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item} className="rounded-md border border-slate-800 bg-slate-900/70 p-2.5 text-xs leading-5 text-slate-300">
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ServiceDetail({ slug }: ServiceDetailProps) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, isError } = useGetServiceQuery(slug);
  const { data: categoriesData } = useGetServiceCategoriesQuery();
  const categoryLabel = (code: string) => categoriesData?.categories.find((item) => item.code === code)?.title ?? code;
  const [launchService, launchState] = useLaunchServiceMutation();
  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<FileValues>({});
  const [tier, setTier] = useState<ServiceTier>('standard');
  const [mediaByKind, setMediaByKind] = useState<Record<string, MediaAssetOption[]>>({});
  const [activeView, setActiveView] = useState<ServiceDetailView>('service');
  const [expandedGenerationId, setExpandedGenerationId] = useState<string | null>(null);
  const projectsQuery = useListProjectsQuery(
    { page: 1, limit: 40 },
    { skip: !user, pollingInterval: activeView === 'generations' ? 3000 : 0 },
  );

  const service = data?.service;
  const projects = useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data?.items]);
  const fields = useMemo(() => parseFields(service?.userInputForm), [service?.userInputForm]);
  const photoFields = useMemo(() => fields.filter((field) => field.type === 'photo'), [fields]);
  const tierField = useMemo(() => fields.find((field) => field.type === 'tier'), [fields]);
  const photoGroups = useMemo(() => {
    const buckets = new Map<string, UserInputField[]>();
    for (const field of photoFields) {
      const key = field.mediaGroup ?? '__default__';
      const bucket = buckets.get(key);
      if (bucket) bucket.push(field);
      else buckets.set(key, [field]);
    }
    return Array.from(buckets.values());
  }, [photoFields]);
  const selectedPreviewVideo = useMemo(() => selectedVideoPreview(fields, values, mediaByKind), [fields, values, mediaByKind]);

  useEffect(() => {
    const latest = projects[0];
    if (!latest) {
      setExpandedGenerationId(null);
      return;
    }
    setExpandedGenerationId((current) => current ?? latest.id);
  }, [projects]);

  // Prefill default values (e.g. scene_mode -> "photo", duration/aspect defaults) when the service loads,
  // so conditional fields (visibleWhen) render correctly from the first paint.
  useEffect(() => {
    if (fields.length === 0) return;
    setValues((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of fields) {
        if (next[field.id] !== undefined && next[field.id] !== '') continue;
        let def: string | undefined;
        if (field.defaultValue) def = field.defaultValue;
        else if (field.type === 'duration' && field.defaultDuration) def = String(field.defaultDuration);
        else if (field.type === 'aspect_ratio' && field.defaultAspect) def = field.defaultAspect;
        else if (field.type === 'slides') def = JSON.stringify(['', '', '']);
        if (def !== undefined) {
          next[field.id] = def;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [fields]);

  useEffect(() => {
    const specs = new Map<string, { kind: string; group?: string }>();
    for (const field of fields) {
      if (field.type === 'media-select' && field.mediaKind) {
        const key = mediaSelectKey(field.mediaKind, field.mediaGroup);
        if (!specs.has(key)) specs.set(key, { kind: field.mediaKind, group: field.mediaGroup });
      }
    }
    if (specs.size === 0) return;
    let cancelled = false;
    Promise.all(
      Array.from(specs.entries()).map(async ([key, spec]) => {
        const params = new URLSearchParams({ kind: spec.kind, active: 'true' });
        if (spec.group) params.set('group', spec.group);
        const res = await fetch(`${API_URL}/api/public/media-assets?${params.toString()}`, { credentials: 'include' });
        const json = await res.json() as { assets?: MediaAssetOption[] };
        return [key, json.assets ?? []] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setMediaByKind(Object.fromEntries(entries));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fields]);

  if (isLoading) {
    return (
      <div className="container py-14">
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    );
  }

  if (isError || !service) {
    return (
      <section className="container py-20">
        <Card className="max-w-2xl border-slate-800 bg-slate-900">
          <CardContent className="p-8">
            <h1 className="text-3xl font-bold">Услуга не найдена</h1>
            <p className="mt-3 text-slate-400">Возможно, ссылка устарела или услуга временно скрыта из каталога.</p>
            <Button asChild className="mt-6">
              <Link href="/services">Вернуться к услугам</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const basePrice = tierField ? tierPrice(service, tier) : servicePrice(service);
  const slidesCount = slideCount(fields, values);
  const msPrice = multiselectPrice(fields, values);
  const price = msPrice !== null ? msPrice : slidesCount > 0 ? basePrice * slidesCount : basePrice;
  const balance = user?.tokenBalance ?? 0;
  const hasEnoughCoins = !!user && balance >= price;
  const preview = previewImage(service);
  const previewVideo = selectedPreviewVideo ?? (service.previewMode === 'image' ? null : mediaUrl(service.previewVideo));
  const loginHref = `/login?redirect=/services/${service.slug}`;

  const setFieldValue = (id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
  };

  const setFieldFile = (id: string, file?: File) => {
    setFiles((current) => ({ ...current, [id]: file }));
  };

  const submit = async () => {
    if (!user) {
      router.push(loginHref);
      return;
    }
    if (!hasEnoughCoins) {
      toast({
        title: 'Недостаточно токенов',
        description: `Нужно ${price}, на балансе ${balance}.`,
        className: warningToastClass,
      });
      router.push('/profile?tab=billing');
      return;
    }

    const errors = validateClient(fields, values, files);
    if (errors.length > 0) {
      toast({
        title: 'Проверьте форму',
        description: errors[0],
        className: warningToastClass,
      });
      return;
    }

    const dataPayload: FormValues = { ...values };
    if (tierField) dataPayload[tierField.id] = tier;

    // Fill defaults for duration/aspect_ratio if user did not touch the buttons
    for (const field of fields) {
      if (field.type === 'duration' && (!dataPayload[field.id] || dataPayload[field.id] === '')) {
        const options = field.durationOptions && field.durationOptions.length > 0 ? field.durationOptions : [5];
        dataPayload[field.id] = String(field.defaultDuration ?? options[0]);
      }
      if (field.type === 'aspect_ratio' && (!dataPayload[field.id] || dataPayload[field.id] === '')) {
        const options = field.aspectOptions ?? ['auto'];
        dataPayload[field.id] = field.defaultAspect ?? options[0];
      }
    }

    const payloadObj: Record<string, unknown> = { ...dataPayload };
    for (const field of fields) {
      if (field.type === 'slides' || field.type === 'multiselect') {
        payloadObj[field.id] = parseSlides(dataPayload[field.id]);
      }
    }

    const formData = new FormData();
    formData.append('data', JSON.stringify(payloadObj));
    for (const field of fields) {
      if (field.type !== 'photo' && field.type !== 'audio' && field.type !== 'video') continue;
      const file = files[field.id];
      if (file) formData.append(field.id, file);
    }

    try {
      const result = await launchService({ slug: service.slug, formData }).unwrap();
      setActiveView('generations');
      setExpandedGenerationId(result.project.id);
      void projectsQuery.refetch();
      toast({
        title: 'Генерация запущена',
        description: 'Прогресс и результат появятся слева во вкладке «Генерации».',
      });
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'INSUFFICIENT_TOKENS') {
        toast({
          title: 'Недостаточно токенов',
          description: LAUNCH_ERROR_MESSAGES.INSUFFICIENT_TOKENS,
          className: warningToastClass,
        });
        router.push('/profile?tab=billing');
        return;
      }
      toast({
        title: 'Запуск не выполнен',
        description: launchErrorMessage(error),
        className: warningToastClass,
      });
    }
  };

  return (
    <section className="container py-10 md:py-14">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div className="space-y-8">
          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            {([
              ['service', 'Услуга'],
              ['generations', 'Генерации'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveView(id)}
                className={cn(
                  'rounded-md px-4 py-2 text-sm font-semibold transition',
                  activeView === id
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {activeView === 'service' ? (
            <>
              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                {previewVideo ? (
                  <div className="flex justify-center bg-slate-950">
                    <div className="aspect-[9/16] h-[70vh] min-h-[360px] max-h-[620px] max-w-full">
                      <video
                        key={previewVideo}
                        src={previewVideo}
                        muted
                        loop
                        playsInline
                        autoPlay
                        controls
                        className="h-full w-full object-contain"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="relative aspect-[16/10]">
                    <Image src={preview} alt={service.title} fill priority sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover" />
                  </div>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="bg-slate-800 text-indigo-100">
                    {categoryLabel(service.category)}
                  </Badge>
                  {service.isFeatured && (
                    <Badge className="border-amber-300/60 bg-amber-400 text-slate-950">
                      <Star className="h-3.5 w-3.5" />
                      Популярное
                    </Badge>
                  )}
                </div>
                <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight md:text-6xl">{service.title}</h1>
                <p className="mt-5 text-lg leading-8 text-slate-300">{service.description}</p>
              </div>
            </>
          ) : (
            <GenerationsPanel
              projects={projects}
              isLoading={projectsQuery.isLoading}
              expandedId={expandedGenerationId}
              onExpandedChange={setExpandedGenerationId}
            />
          )}
        </div>

        <Card className="border-slate-800 bg-slate-900 lg:sticky lg:top-6 lg:flex lg:max-h-[calc(100vh-3rem)] lg:flex-col lg:overflow-hidden">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-xl">Создать услугу</CardTitle>
              <FileCriteriaInfo fields={fields} />
            </div>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            {!user && !isAuthLoading ? (
              <div className="space-y-5 px-6 pb-6">
                <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4 text-center">
                  <div className="text-xs uppercase tracking-wider text-amber-300">Стоимость услуги</div>
                  <div className="mt-1 text-3xl font-black text-amber-200">{price} коинов</div>
                </div>
                <Alert className="border-slate-700 bg-slate-950">
                  <Lock className="h-4 w-4" />
                  <AlertTitle>Нужен вход</AlertTitle>
                  <AlertDescription className="mt-2">
                    <Button asChild className="mt-3 bg-amber-500 text-slate-950 hover:bg-amber-400">
                      <Link href={loginHref}>Войти, чтобы создать</Link>
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5 lg:pr-5">
                  <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-4 text-center">
                    <div className="text-xs uppercase tracking-wider text-amber-300">Стоимость услуги</div>
                    <div className="mt-1 text-3xl font-black text-amber-200">{price} коинов</div>
                  </div>

                  {tierField && (
                    <TierSelector field={tierField} service={service} value={tier} onChange={setTier} />
                  )}

                  {fields
                    .filter((field) => field.type !== 'tier' && fieldVisible(field, values))
                    .map((field) => {
                      if (field.type === 'photo') {
                        if (photoFields[0]?.id !== field.id) return null;
                        const visibleGroups = photoGroups
                          .map((group) => group.filter((item) => fieldVisible(item, values)))
                          .filter((group) => group.length > 0);
                        return (
                          <div key="photo-references" className="space-y-5">
                            {visibleGroups.map((group) => (
                              <ServicePhotoReferencesGroup
                                key={group[0].id}
                                fields={group}
                                values={values}
                                files={files}
                                onValueChange={setFieldValue}
                                onFileChange={setFieldFile}
                              />
                            ))}
                          </div>
                        );
                      }

                      return (
                        <FieldControl
                          key={field.id}
                          field={field}
                          value={values[field.id]}
                          file={files[field.id]}
                          mediaOptions={mediaByKind}
                          onValueChange={setFieldValue}
                          onFileChange={setFieldFile}
                        />
                      );
                    })}
                </div>

                <div className="shrink-0 space-y-4 border-t border-slate-800 bg-slate-900 px-6 py-5 shadow-[0_-16px_32px_rgba(2,6,23,0.45)]">
                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-slate-400">Ваш баланс</span>
                      <span className={cn('font-bold', hasEnoughCoins ? 'text-emerald-300' : 'text-amber-300')}>
                        {balance} коинов
                      </span>
                    </div>
                    {!hasEnoughCoins && (
                      <div className="mt-3 flex items-start gap-2 text-sm text-amber-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>Недостаточно коинов для запуска услуги.</span>
                      </div>
                    )}
                  </div>

                  <Button
                    type="button"
                    onClick={submit}
                    disabled={launchState.isLoading || isAuthLoading}
                    className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
                    size="lg"
                  >
                    {launchState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TokenIcon className="h-4 w-4" />}
                    Создать за {price} коинов
                  </Button>
                  {!hasEnoughCoins && user && (
                    <Button asChild variant="outline" className="w-full border-slate-700 bg-slate-950">
                      <Link href="/profile?tab=billing">Пополнить баланс</Link>
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
