'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CopyPlus,
  DollarSign,
  Grip,
  ImageIcon,
  Library,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
} from 'lucide-react';
import {
  ACADEMY_GENERATION_ASPECT_RATIOS,
  ACADEMY_GENERATION_KIND_LABELS,
  ACADEMY_GENERATION_KINDS,
  ACADEMY_GENERATION_MODELS,
  ACADEMY_GENERATION_OPERATION_LABELS,
  ACADEMY_GENERATION_OPERATIONS,
  ACADEMY_GENERATION_STYLE_LABELS,
  ACADEMY_GENERATION_STYLES,
  ACADEMY_VIDEO_DURATIONS,
  ACADEMY_VIDEO_SOURCES,
  academyVideoModel,
  academyVideoModelsBySource,
  academyVideoRequirement,
  estimateAcademyCostUsd,
  generationKindToAsset,
  type AcademyAssetDto,
  type AcademyGenerationInput,
  type AcademyGenerationKind,
  type AcademyGenerationOperation,
  type AcademyLibraryScope,
  type AcademyVideoModelSlug,
} from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useDeleteAcademyAssetMutation,
  useGenerateAcademyMaterialMutation,
  useGetAcademyGenerationQuery,
  useGetAcademyLibraryQuery,
  useGetGenerationChildrenQuery,
  usePromoteAcademyAssetMutation,
  useUpdateAcademyAssetMutation,
} from '@/store/api/academy-materials-api';

function apiError(error: unknown): string {
  const data = (error as { data?: { error?: { message?: string } } })?.data;
  return data?.error?.message ?? 'Ошибка, попробуйте ещё раз';
}

const selectClass = 'h-10 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none ring-offset-background focus:ring-2 focus:ring-ring';

type FormState = {
  kind: AcademyGenerationKind;
  operation: AcademyGenerationOperation;
  title: string;
  prompt: string;
  systemPrompt: string;
  model: (typeof ACADEMY_GENERATION_MODELS)[number];
  style: (typeof ACADEMY_GENERATION_STYLES)[number];
  aspectRatio: (typeof ACADEMY_GENERATION_ASPECT_RATIOS)[number];
  quality: 'low' | 'medium' | 'high';
  resolution: '1K' | '2K' | '4K';
  count: number;
  transparentBackground: boolean;
  media: 'image' | 'video';
  videoModel: AcademyVideoModelSlug;
  durationSec: number;
  childId: string;
  outfit: string;
  emotion: string;
  cameraAngle: string;
  lighting: string;
  maxCostUsd: number;
};

const initialForm: FormState = {
  kind: 'background',
  operation: 'generate',
  title: '',
  prompt: '',
  systemPrompt: '',
  model: 'nano-banana',
  style: 'cinematic-animation',
  aspectRatio: '16:9',
  quality: 'medium',
  resolution: '1K',
  count: 1,
  transparentBackground: false,
  media: 'image',
  videoModel: 'kling-3-std',
  durationSec: 5,
  childId: '',
  outfit: '',
  emotion: '',
  cameraAngle: '',
  lighting: '',
  maxCostUsd: 1,
};

function buildInput(form: FormState, referenceAssetIds: string[]): AcademyGenerationInput {
  const childTarget = generationKindToAsset(form.kind).scope === 'child';
  const video = form.media === 'video';
  const transparentBackground = form.transparentBackground || form.operation === 'transparent-background';
  return {
    kind: form.kind,
    // У видео нет операций над изображением (прозрачный фон, апскейл и т.п.) — воркер их
    // не применяет, поэтому не отправляем «залипшую» операцию из режима картинок.
    operation: video ? 'generate' : form.operation,
    title: form.title.trim(),
    prompt: form.prompt.trim(),
    systemPrompt: form.systemPrompt.trim() || undefined,
    model: form.model,
    style: form.style,
    aspectRatio: form.aspectRatio,
    quality: form.quality,
    resolution: form.resolution,
    count: form.media === 'video' ? 1 : form.count,
    transparentBackground: form.media === 'video' ? false : transparentBackground,
    media: form.media,
    videoModel: form.videoModel,
    durationSec: form.durationSec,
    childId: childTarget ? form.childId || undefined : undefined,
    topicId: undefined,
    characterReferenceIds: [],
    referenceAssetIds,
    outfit: childTarget && form.outfit.trim() ? form.outfit.trim() : undefined,
    emotion: childTarget && form.emotion.trim() ? form.emotion.trim() : undefined,
    cameraAngle: form.cameraAngle.trim() || undefined,
    lighting: form.lighting.trim() || undefined,
    tags: [],
    maxCostUsd: form.maxCostUsd,
  };
}

function GenerationPanel({ onChildSelected }: { onChildSelected: (id: string) => void }) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [referenceAssetIds, setReferenceAssetIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState('');
  const [polling, setPolling] = useState(false);
  const children = useGetGenerationChildrenQuery();
  const [generate, generationMutation] = useGenerateAcademyMaterialMutation();
  const generation = useGetAcademyGenerationQuery(projectId, {
    skip: !projectId,
    pollingInterval: polling ? 2000 : 0,
  });
  const input = useMemo(() => buildInput(form, referenceAssetIds), [form, referenceAssetIds]);
  const estimate = useMemo(() => estimateAcademyCostUsd(input), [input]);
  const childTarget = generationKindToAsset(form.kind).scope === 'child';
  const childOptions = useMemo(() => children.data?.items ?? [], [children.data?.items]);
  const videoSource = academyVideoModel(form.videoModel)?.source ?? 'image';
  const videoRequirement = form.media === 'video'
    ? academyVideoRequirement({
        videoModel: form.videoModel,
        scope: childTarget ? 'child' : 'teacher',
        referenceCount: referenceAssetIds.length,
      })
    : null;

  // Единая причина, почему запуск невозможен: раньше об этом узнавали из тоста после клика
  // (или вовсе из ошибки воркера — например про обязательный референс).
  const blockedReason = (() => {
    if (!form.title.trim()) return 'Укажите название материала';
    if (form.prompt.trim().length < 8) return 'Опишите результат подробнее (минимум 8 символов)';
    if (childTarget && !form.childId) return 'Выберите ученика';
    if (videoRequirement) return videoRequirement;
    if (form.media === 'image' && ['variation', 'inpaint', 'upscale'].includes(form.operation) && !childTarget && referenceAssetIds.length === 0) {
      return 'Для этой операции выберите референс из библиотеки ниже';
    }
    if (estimate > form.maxCostUsd) return `Поднимите допустимую стоимость до $${estimate.toFixed(2)}`;
    return null;
  })();

  useEffect(() => {
    const status = generation.data?.generation.status;
    if (status === 'COMPLETED' || status === 'FAILED') setPolling(false);
    if (status === 'COMPLETED') window.dispatchEvent(new Event('academy:library-refresh'));
  }, [generation.data?.generation.status]);

  useEffect(() => {
    if (childTarget && !form.childId && childOptions[0]) {
      setForm((current) => ({ ...current, childId: childOptions[0].id, aspectRatio: '3:4' }));
      onChildSelected(childOptions[0].id);
    }
  }, [childOptions, childTarget, form.childId, onChildSelected]);

  const launch = async () => {
    if (blockedReason) {
      toast({ title: 'Нельзя запустить', description: blockedReason, variant: 'destructive' });
      return;
    }
    try {
      const result = await generate(input).unwrap();
      setProjectId(result.generation.projectId);
      setPolling(true);
      toast({ title: 'Генерация поставлена в очередь' });
    } catch (error) {
      toast({ title: 'Не удалось запустить генерацию', description: apiError(error), variant: 'destructive' });
    }
  };

  const status = generation.data?.generation;

  return (
    <Card className="border-border bg-card shadow-sm">
      <CardContent className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <WandSparkles className="h-5 w-5 text-primary" /> Панель генерации
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Общие материалы сохраняются в вашу библиотеку, материалы с ребёнком — только в закрытую персональную.
            </p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-accent px-3 py-2 text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Оценка до запуска</p>
            <p className="text-lg font-bold text-primary">${estimate.toFixed(2)}</p>
          </div>
        </div>

        {/* Шаг 1 — что создаём. От этого зависит весь остальной набор полей. */}
        <div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['image', 'Изображение', 'Фон, предмет, NPC, поза или сцена — картинка для урока.'],
              ['video', 'Видео (кат-сцена)', 'Короткий ролик: вступление к уроку, награда, оживший кадр.'],
            ] as const).map(([value, label, description]) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm((current) => ({ ...current, media: value }))}
                className={cn(
                  'rounded-xl border p-3 text-left transition',
                  form.media === value ? 'border-primary bg-accent/60' : 'border-border hover:border-primary/40',
                )}
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Шаг 2 — тип материала и оформление. Операция и модель картинок относятся только
            к изображениям: для видео воркер их не использует, поэтому и не показываем. */}
        <div className={cn('grid gap-4 md:grid-cols-2', form.media === 'image' ? 'xl:grid-cols-4' : 'xl:grid-cols-2')}>
          <Field label="Тип материала">
            <select
              className={selectClass}
              value={form.kind}
              onChange={(event) => {
                const kind = event.target.value as AcademyGenerationKind;
                const personal = generationKindToAsset(kind).scope === 'child';
                setForm((current) => ({
                  ...current,
                  kind,
                  aspectRatio: personal ? '3:4' : '16:9',
                  transparentBackground: false,
                }));
              }}
            >
              {ACADEMY_GENERATION_KINDS.map((kind) => <option key={kind} value={kind}>{ACADEMY_GENERATION_KIND_LABELS[kind]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">
              {childTarget
                ? 'Сохранится в закрытую библиотеку ученика — только вы и родитель.'
                : 'Сохранится в вашу личную библиотеку, её можно переиспользовать в любом уроке.'}
            </p>
          </Field>
          {form.media === 'image' && (
            <>
              <Field label="Операция">
                <select className={selectClass} value={form.operation} onChange={(event) => setForm((current) => ({ ...current, operation: event.target.value as AcademyGenerationOperation }))}>
                  {ACADEMY_GENERATION_OPERATIONS.map((operation) => <option key={operation} value={operation}>{ACADEMY_GENERATION_OPERATION_LABELS[operation]}</option>)}
                </select>
                {['variation', 'inpaint', 'upscale'].includes(form.operation) && (
                  <p className="text-xs text-muted-foreground">Нужен референс из библиотеки — кнопка «В референсы» на карточке.</p>
                )}
              </Field>
              <Field label="Модель изображения">
                <select className={selectClass} value={form.model} onChange={(event) => setForm((current) => ({ ...current, model: event.target.value as FormState['model'] }))}>
                  <option value="nano-banana">Nano Banana Pro</option>
                  <option value="gpt-image-2">GPT Image 2</option>
                </select>
              </Field>
            </>
          )}
          <Field label="Стиль">
            <select className={selectClass} value={form.style} onChange={(event) => setForm((current) => ({ ...current, style: event.target.value as FormState['style'] }))}>
              {ACADEMY_GENERATION_STYLES.map((style) => <option key={style} value={style}>{ACADEMY_GENERATION_STYLE_LABELS[style]}</option>)}
            </select>
            <p className="text-xs text-muted-foreground">Общая манера картинки или ролика.</p>
          </Field>
        </div>

        {childTarget && (
          <div className="grid gap-4 rounded-xl border border-primary/20 bg-accent/60 p-4 md:grid-cols-3">
            <Field label="Ученик">
              <select
                className={selectClass}
                value={form.childId}
                onChange={(event) => {
                  setForm((current) => ({ ...current, childId: event.target.value }));
                  onChildSelected(event.target.value);
                }}
              >
                <option value="">Выберите ребёнка</option>
                {childOptions.map((child) => (
                  <option key={child.id} value={child.id} disabled={child.characterStatus !== 'APPROVED'}>
                    {child.name}{child.characterStatus === 'APPROVED' ? '' : ' · персонаж не утверждён'}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Одежда">
              <Input value={form.outfit} onChange={(event) => setForm((current) => ({ ...current, outfit: event.target.value }))} placeholder="Костюм исследователя" />
            </Field>
            <Field label="Эмоция / поза">
              <Input value={form.emotion} onChange={(event) => setForm((current) => ({ ...current, emotion: event.target.value }))} placeholder="Радость, показывает на карту" />
            </Field>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          <div className="space-y-4">
            <Field label="Название">
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Например, Замок чисел" />
            </Field>
            <Field label="Описание результата">
              <Textarea value={form.prompt} onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))} rows={5} placeholder="Опишите композицию, объекты, настроение и образовательную задачу…" />
            </Field>
            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Дополнительные параметры</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Системная инструкция">
                  <Input value={form.systemPrompt} onChange={(event) => setForm((current) => ({ ...current, systemPrompt: event.target.value }))} placeholder="Необязательно" />
                </Field>
                <Field label="Ракурс">
                  <Input value={form.cameraAngle} onChange={(event) => setForm((current) => ({ ...current, cameraAngle: event.target.value }))} placeholder="Вид немного сверху" />
                </Field>
                <Field label="Свет">
                  <Input value={form.lighting} onChange={(event) => setForm((current) => ({ ...current, lighting: event.target.value }))} placeholder="Мягкий утренний" />
                </Field>
              </div>
            </details>
          </div>

          <div className="space-y-4 rounded-xl border border-border bg-muted/40 p-4">
            {form.media === 'video' ? (
              <div className="space-y-3">
                {/* Способ вперёд модели: он объясняет, почему одни модели оживляют кадр,
                    а другие снимают по описанию, и что для этого нужно на входе. */}
                <Field label="Как делаем видео">
                  <div className="grid gap-1.5">
                    {ACADEMY_VIDEO_SOURCES.map((source) => {
                      const active = videoSource === source.id;
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() => {
                            const first = academyVideoModelsBySource(source.id)[0];
                            if (first) setForm((current) => ({ ...current, videoModel: first.slug }));
                          }}
                          className={cn(
                            'rounded-lg border px-3 py-2 text-left transition',
                            active ? 'border-primary bg-accent/70' : 'border-border bg-background hover:border-primary/40',
                          )}
                        >
                          <span className="block text-sm font-medium">{source.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{source.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </Field>

                <Field label="Модель">
                  <select className={selectClass} value={form.videoModel} onChange={(event) => setForm((current) => ({ ...current, videoModel: event.target.value as AcademyVideoModelSlug }))}>
                    {academyVideoModelsBySource(videoSource).map((m) => <option key={m.slug} value={m.slug}>{m.label} — {m.hint}</option>)}
                  </select>
                </Field>

                {videoSource === 'image' && (
                  <p className={cn('rounded-lg px-3 py-2 text-xs', videoRequirement ? 'bg-amber-50 text-amber-900' : 'bg-background text-muted-foreground')}>
                    {videoRequirement
                      ?? (childTarget
                        ? 'Оживим утверждённый портрет ученика из его AI-персонажа.'
                        : `Исходный кадр выбран: референсов ${referenceAssetIds.length}.`)}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Длительность, сек">
                    <select className={selectClass} value={form.durationSec} onChange={(event) => setForm((current) => ({ ...current, durationSec: Number(event.target.value) }))}>
                      {ACADEMY_VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Формат">
                    <select className={selectClass} value={form.aspectRatio} onChange={(event) => setForm((current) => ({ ...current, aspectRatio: event.target.value as FormState['aspectRatio'] }))}>
                      {ACADEMY_GENERATION_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                    </select>
                  </Field>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Формат">
                    <select className={selectClass} value={form.aspectRatio} onChange={(event) => setForm((current) => ({ ...current, aspectRatio: event.target.value as FormState['aspectRatio'] }))}>
                      {ACADEMY_GENERATION_ASPECT_RATIOS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                    </select>
                  </Field>
                  <Field label="Количество">
                    <select className={selectClass} value={form.count} onChange={(event) => setForm((current) => ({ ...current, count: Number(event.target.value) }))}>
                      {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                    </select>
                  </Field>
                  <Field label="Качество">
                    <select className={selectClass} value={form.quality} onChange={(event) => setForm((current) => ({ ...current, quality: event.target.value as FormState['quality'] }))}>
                      <option value="low">Черновое</option><option value="medium">Стандарт</option><option value="high">Высокое</option>
                    </select>
                  </Field>
                  <Field label="Разрешение">
                    <select className={selectClass} value={form.resolution} onChange={(event) => setForm((current) => ({ ...current, resolution: event.target.value as FormState['resolution'] }))}>
                      <option value="1K">1K</option><option value="2K">2K</option><option value="4K">4K</option>
                    </select>
                  </Field>
                </div>
                {!['background', 'scene', 'cutscene'].includes(form.kind) && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.transparentBackground || form.operation === 'transparent-background'}
                      disabled={form.operation === 'transparent-background'}
                      onChange={(event) => setForm((current) => ({ ...current, transparentBackground: event.target.checked }))}
                      className="h-4 w-4 accent-orange-500"
                    />
                    Удалить фон (alpha PNG)
                  </label>
                )}
              </>
            )}
            <Field label="Потолок стоимости, $">
              <Input type="number" min="0.01" max="50" step="0.01" value={form.maxCostUsd} onChange={(event) => setForm((current) => ({ ...current, maxCostUsd: Number(event.target.value) || 0 }))} />
              <p className="text-xs text-muted-foreground">
                Страховка от дорогой генерации: если фактическая цена окажется выше, запуск отменится.
                Сейчас оценка ${estimate.toFixed(2)}.
              </p>
            </Field>
            <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-xs">
              <span className={cn(referenceAssetIds.length === 0 && 'text-muted-foreground')}>
                Референсов из библиотеки: {referenceAssetIds.length}
              </span>
              {referenceAssetIds.length > 0 && (
                <button type="button" className="text-primary" onClick={() => setReferenceAssetIds([])}>Очистить</button>
              )}
            </div>
            {blockedReason && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{blockedReason}</p>
            )}
            <Button className="w-full" onClick={launch} disabled={Boolean(blockedReason) || generationMutation.isLoading || polling}>
              {(generationMutation.isLoading || polling) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Запустить · ${estimate.toFixed(2)}
            </Button>
          </div>
        </div>

        {status && (
          <div className={cn(
            'rounded-xl border px-4 py-3',
            status.status === 'FAILED' ? 'border-destructive/30 bg-destructive/5' : 'border-primary/25 bg-accent/50',
          )}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium">
                {status.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Loader2 className={cn('h-4 w-4 text-primary', polling && 'animate-spin')} />}
                {status.status === 'PENDING' && 'Ожидает воркер'}
                {status.status === 'PROCESSING' && 'Материал создаётся'}
                {status.status === 'COMPLETED' && 'Готово — результат добавлен в библиотеку'}
                {status.status === 'FAILED' && (status.errorMessage ?? 'Генерация завершилась с ошибкой')}
              </span>
              <span>{status.progress}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background">
              <div className="h-full bg-primary transition-all" style={{ width: `${status.progress}%` }} />
            </div>
          </div>
        )}

        <ReferenceBridge referenceAssetIds={referenceAssetIds} onChange={setReferenceAssetIds} />
      </CardContent>
    </Card>
  );
}

// Небольшой bridge через CustomEvent позволяет карточкам библиотеки добавлять референс,
// не поднимая весь form state в корневой компонент.
function ReferenceBridge({ referenceAssetIds, onChange }: { referenceAssetIds: string[]; onChange: (ids: string[]) => void }) {
  useEffect(() => {
    const handler = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) onChange(referenceAssetIds.includes(id) ? referenceAssetIds : [...referenceAssetIds, id].slice(0, 10));
    };
    window.addEventListener('academy:add-reference', handler);
    return () => window.removeEventListener('academy:add-reference', handler);
  }, [onChange, referenceAssetIds]);
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function AssetCard({ asset }: { asset: AcademyAssetDto }) {
  const [remove, deleting] = useDeleteAcademyAssetMutation();
  const [update] = useUpdateAcademyAssetMutation();
  const [promote, promoting] = usePromoteAcademyAssetMutation();
  const isImage = asset.mimeType.startsWith('image/');
  const isVideo = asset.mimeType.startsWith('video/');

  const startDrag = (event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-allvision-academy-asset', JSON.stringify(asset.dragData));
    event.dataTransfer.setData('text/uri-list', asset.fileUrl);
  };

  return (
    <Card draggable onDragStart={startDrag} className="group overflow-hidden border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl ?? asset.fileUrl} alt={asset.title} className="h-full w-full object-cover" />
        ) : isVideo ? (
          <video src={asset.fileUrl} className="h-full w-full object-cover" muted loop playsInline preload="metadata" onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
        )}
        <span className="absolute left-2 top-2 rounded-lg bg-background/90 px-2 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
          {asset.kindLabel}
        </span>
        <span className="absolute right-2 top-2 cursor-grab rounded-lg bg-background/90 p-1.5 text-muted-foreground shadow-sm" title="Перетащите в будущий конструктор A6">
          <Grip className="h-3.5 w-3.5" />
        </span>
      </div>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="truncate font-semibold" title={asset.title}>{asset.title}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
            {asset.childName ? `${asset.childName} · ` : ''}{asset.generationModel ?? 'загруженный материал'}
            {asset.generationCostUsd > 0 ? ` · $${asset.generationCostUsd.toFixed(2)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {asset.tags.filter((tag) => !tag.startsWith('project:')).slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-border pt-3">
          {asset.scope !== 'child' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.dispatchEvent(new CustomEvent('academy:add-reference', { detail: asset.id }))}
            >
              <CopyPlus className="mr-1 h-3.5 w-3.5" /> В референсы
            </Button>
          )}
          {asset.canPromote && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={promoting.isLoading}
              onClick={async () => {
                await promote({ sourceScope: 'teacher', assetId: asset.id }).unwrap()
                  .then(() => toast({ title: 'Материал добавлен в общую библиотеку' }))
                  .catch((error) => toast({ title: 'Не удалось промоутить', description: apiError(error), variant: 'destructive' }));
              }}
            >
              <Library className="mr-1 h-3.5 w-3.5" /> В общую
            </Button>
          )}
          {asset.canEdit && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const title = window.prompt('Новое название', asset.title)?.trim();
                  if (!title || title === asset.title) return;
                  await update({ scope: asset.scope, id: asset.id, body: { title } }).unwrap()
                    .catch((error) => toast({ title: 'Не удалось переименовать', description: apiError(error), variant: 'destructive' }));
                }}
              >
                Изменить
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={deleting.isLoading}
                onClick={async () => {
                  if (!window.confirm(`Удалить «${asset.title}»?`)) return;
                  await remove({ scope: asset.scope, id: asset.id }).unwrap()
                    .catch((error) => toast({ title: 'Не удалось удалить', description: apiError(error), variant: 'destructive' }));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LibraryPanel({ selectedChildId, onChildSelected }: { selectedChildId: string; onChildSelected: (id: string) => void }) {
  const [scope, setScope] = useState<AcademyLibraryScope>('teacher');
  const [search, setSearch] = useState('');
  const children = useGetGenerationChildrenQuery();
  const childOptions = children.data?.items ?? [];
  const activeChildId = selectedChildId || childOptions[0]?.id || '';
  const query = useGetAcademyLibraryQuery(
    { scope, childId: scope === 'child' ? activeChildId : undefined, search: search || undefined },
    { skip: scope === 'child' && !activeChildId, pollingInterval: 0 },
  );
  const items = query.data?.items ?? [];
  const refetchLibrary = query.refetch;

  useEffect(() => {
    const handler = () => refetchLibrary();
    window.addEventListener('academy:library-refresh', handler);
    return () => window.removeEventListener('academy:library-refresh', handler);
  }, [refetchLibrary]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold"><Library className="h-5 w-5 text-primary" /> Библиотеки</h2>
          <p className="mt-1 text-sm text-muted-foreground">Карточки уже содержат drag payload для конструктора сцен A6.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск материалов" className="pl-9" />
          {search && <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setSearch('')}><X className="h-4 w-4" /></button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['teacher', 'Моя библиотека'],
          ['shared', 'Общая'],
          ['child', 'Ученика'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setScope(value)}
            className={cn(
              'rounded-full border px-4 py-2 text-sm font-medium transition',
              scope === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
        {scope === 'child' && (
          <select
            className="h-10 rounded-full border border-input bg-background px-3 text-sm"
            value={activeChildId}
            onChange={(event) => onChildSelected(event.target.value)}
          >
            <option value="">Выберите ребёнка</option>
            {childOptions.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>
        )}
      </div>

      {query.isLoading || query.isFetching ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="aspect-[4/3] animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <ImageIcon className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-medium">В этой библиотеке пока нет материалов</p>
          <p className="mt-1 text-sm text-muted-foreground">Создайте первый материал в панели выше.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
        </div>
      )}
    </div>
  );
}

export function AcademyMaterialsWorkspace({ admin = false }: { admin?: boolean }) {
  const [selectedChildId, setSelectedChildId] = useState('');
  return (
    <div className={cn('academy-theme min-h-screen bg-background text-foreground', admin && 'rounded-2xl')}>
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Allvision Academy · A5
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Генерация и материалы</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Подготовьте фоны, предметы, NPC и персональные сцены заранее — урок не зависит от доступности AI в момент занятия.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <DollarSign className="h-4 w-4 text-primary" /> Все вызовы учитываются в AIUsageLog
          </div>
        </div>
        <GenerationPanel onChildSelected={setSelectedChildId} />
        <LibraryPanel selectedChildId={selectedChildId} onChildSelected={setSelectedChildId} />
      </div>
    </div>
  );
}
