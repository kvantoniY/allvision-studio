'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import {
  CHAT_MODELS,
  SCENE_PRESETS,
  chatReferenceSlots,
  SCENE_PRESET_GROUPS,
  SCENE_PRESET_GROUP_TITLES,
  estimateChatGenerationPriceCoins,
  formatTokens,
  primaryMediaLayer,
  type ChatAspectRatio,
  type MediaLayer,
  type TimelineAspect,
  type TimelineScene,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useGetChatModelsQuery } from '@/store/api/user-chat-api';
import { useGetStylePresetsQuery } from '@/store/api/public-api';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { cn } from '@/lib/utils';

/**
 * Панель генерации внутри сцены.
 *
 * Список моделей сознательно сужен до тех, что подходят выбранному референсу: есть кадр —
 * предлагаем оживить именно его, нет — генерацию с нуля. Показывать модель, которая не
 * сможет отработать, значит продавать ошибку.
 *
 * Референс и место результата названы явно и показаны миниатюрой. На коллаже из нескольких
 * кадров догадаться, «от чего» считает нейросеть, иначе невозможно — а это ровно то, на что
 * жаловались в прежнем редакторе.
 */

const DURATION_OPTIONS = [5, 8, 10];

/** Куда встанет результат: в новый слой поверх сцены или на место выделенного. */
export type SceneGenerationTarget = 'new' | 'selected';

export type SceneGenerationRequest = {
  modelSlug: string;
  prompt: string;
  aspectRatio: ChatAspectRatio;
  duration?: number;
  imageInputRef?: string;
  /** Дополнительные референсы модели: столько, сколько она принимает. */
  params?: Record<string, unknown>;
  target: SceneGenerationTarget;
};

function aspectForTimeline(aspect: TimelineAspect): ChatAspectRatio {
  // 4:5 у моделей нет — берём ближайшую вертикаль, иначе провайдер вернёт ошибку формата.
  if (aspect === '4:5') return '9:16';
  return aspect as ChatAspectRatio;
}

type ReferenceChoice = 'selected' | 'scene' | 'none';

function imageLayer(layer: MediaLayer | null | undefined): MediaLayer | null {
  return layer && layer.source.kind === 'image' && layer.source.url ? layer : null;
}

export function SceneGenerator({
  scene,
  aspect,
  balance,
  running,
  selectedLayer,
  onUploadReference,
  onGenerate,
}: {
  scene: TimelineScene;
  aspect: TimelineAspect;
  balance: number;
  running: boolean;
  /** Выделенный на холсте медиа-слой: он же по умолчанию и референс, и место результата. */
  selectedLayer: MediaLayer | null;
  /** Загружает файл и возвращает публичную ссылку — тот же путь, что у материала сцены. */
  onUploadReference: (file: File) => Promise<string | null>;
  onGenerate: (request: SceneGenerationRequest) => void;
}) {
  // Референс по умолчанию — тот кадр, который человек выделил. Если не выделен ничего,
  // берём главный кадр сцены: на сцене из одного слоя это одно и то же.
  const selectedRef = imageLayer(selectedLayer);
  const primary = primaryMediaLayer(scene);
  const sceneRef = selectedRef?.id === primary?.id ? null : imageLayer(primary);

  const [refChoice, setRefChoice] = useState<ReferenceChoice | null>(null);
  const [target, setTarget] = useState<SceneGenerationTarget>('new');

  // Сбрасываем выбор при смене выделения — и только при ней. Если завязаться на сам объект
  // слоя, выбор слетал бы от любой правки сцены: слой пересоздаётся на каждое изменение.
  const selectedLayerId = selectedLayer?.id ?? null;
  useEffect(() => {
    setRefChoice(null);
    if (!selectedLayerId) setTarget('new');
  }, [selectedLayerId]);

  const activeChoice: ReferenceChoice = refChoice ?? (selectedRef ? 'selected' : sceneRef ? 'scene' : 'none');
  const reference = activeChoice === 'selected' ? selectedRef : activeChoice === 'scene' ? sceneRef : null;
  const hasImage = Boolean(reference);
  // Оверрайды цен живут в БД и работают как минимум: без них редактор показывал бы
  // цену ниже той, что спишет сервер.
  const { data: pricing } = useGetChatModelsQuery();
  const [prompt, setPrompt] = useState('');
  // Какой шаблон выбран: без подсветки клик по плитке выглядел как «ничего не произошло».
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [duration, setDuration] = useState(5);
  const [modelSlug, setModelSlug] = useState<string | null>(null);

  const models = useMemo(() => {
    return CHAT_MODELS.filter((model) => {
      if (model.experimental) return false;
      // Кадр в сцене — это референс: подходят модели, умеющие принимать изображение.
      if (hasImage) return model.acceptsImageInput;
      return model.acceptsTextOnly;
    });
  }, [hasImage]);

  const model = useMemo(
    () => models.find((item) => item.slug === modelSlug) ?? models[0],
    [models, modelSlug],
  );

  const isVideo = model?.category === 'video';
  const price = useMemo(() => {
    if (!model) return 0;
    return estimateChatGenerationPriceCoins(model.slug, {
      duration: isVideo ? duration : undefined,
      priceOverrides: pricing?.modelPriceOverrides,
    });
  }, [model, isVideo, duration, pricing?.modelPriceOverrides]);

  // Шаблоны сцен ведёт владелец в админке: там же к ним прикладываются превью. Пока набор
  // пуст, показываем встроенный список — редактор не должен остаться без подсказок.
  const { data: scenePresetsData } = useGetStylePresetsQuery({ kind: 'editor-scene' });
  const { data: duoPresetsData } = useGetStylePresetsQuery({ kind: 'editor-scene-duo' });
  const managedSolo = scenePresetsData?.presets ?? [];
  const managedDuo = duoPresetsData?.presets ?? [];
  const hasManaged = managedSolo.length > 0 || managedDuo.length > 0;

  const presets = useMemo(
    () => SCENE_PRESETS.filter((preset) => (preset.needsPhoto ? hasImage : true)),
    [hasImage],
  );

  // Дополнительные референсы модели: столько слотов, сколько она принимает. Первый слот
  // закрывает выбранный кадр сцены, остальные человек прикрепляет сам.
  const slots = useMemo(() => (model ? chatReferenceSlots(model) : []), [model]);
  const [slotRefs, setSlotRefs] = useState<Record<string, string>>({});
  const [slotBusy, setSlotBusy] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingSlotRef = useRef<string | null>(null);

  // Слоты у моделей разные, и чужие ссылки в новой модели смысла не имеют.
  useEffect(() => {
    setSlotRefs({});
  }, [model?.slug]);

  const extraSlots = useMemo(() => {
    // Первый слот изображения занимает кадр сцены, если он выбран референсом.
    if (!reference) return slots;
    const firstImage = slots.find((slot) => slot.mediaKind === 'image');
    return slots.filter((slot) => slot.key !== firstImage?.key);
  }, [slots, reference]);

  const slotParams = useMemo(() => {
    const params: Record<string, unknown> = {};
    const images: string[] = [];
    const imageUrls: string[] = [];
    const mainRef = reference?.source.url;
    const firstImageSlot = slots.find((slot) => slot.mediaKind === 'image');
    if (mainRef && firstImageSlot) {
      if (firstImageSlot.param === 'images') images.push(mainRef);
      if (firstImageSlot.param === 'image_urls') imageUrls.push(mainRef);
    }
    for (const slot of extraSlots) {
      const ref = slotRefs[slot.key];
      if (!ref) continue;
      if (slot.param === 'images') images.push(ref);
      else if (slot.param === 'image_urls') imageUrls.push(ref);
      else if (slot.param === 'video_urls') params.video_urls = [ref];
      else params[slot.param] = ref;
    }
    if (images.length > 0) params.images = images;
    if (imageUrls.length > 0) params.image_urls = imageUrls;
    return params;
  }, [slots, extraSlots, slotRefs, reference]);

  const enoughCoins = balance >= price;
  const canGenerate = Boolean(model) && !running && enoughCoins && (!model?.requiresPrompt || prompt.trim().length > 0);

  return (
    <section className="space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-300" />
        <h3 className="font-semibold text-slate-100">Сгенерировать нейросетью</h3>
      </div>

      <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
        <div className="flex items-start gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-700 bg-slate-900">
            {reference?.source.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(reference.source.url) ?? ''} alt="" className="h-full w-full object-cover" />
            ) : (
              <button
                type="button"
                onClick={() => {
                  // Прикрепляем в первый слот изображения: у моделей без слотов он же и есть
                  // единственный вход, поэтому кнопка работает одинаково везде.
                  const firstImage = slots.find((slot) => slot.mediaKind === 'image');
                  pendingSlotRef.current = firstImage?.key ?? 'main';
                  fileInputRef.current?.click();
                }}
                title="Прикрепить файл-референс"
                className="grid h-full w-full place-items-center gap-0.5 text-[10px] text-slate-500 transition hover:text-slate-300"
              >
                <Plus className="h-3.5 w-3.5" />
                файл
              </button>
            )}
          </div>
          <div className="min-w-0 text-xs leading-5 text-slate-400">
            {reference ? (
              <>
                <span className="text-slate-200">
                  {activeChoice === 'selected' ? 'Референс: выделенный слой' : 'Референс: главный кадр сцены'}
                </span>
                <br />
                Нейросеть оживит именно этот кадр.
              </>
            ) : (
              'Референса нет — генерация пойдёт по одному описанию.'
            )}
          </div>
        </div>

        {(selectedRef || sceneRef) && (
          <div className="flex flex-wrap gap-1.5">
            {selectedRef && (
              <ChoiceChip active={activeChoice === 'selected'} onClick={() => setRefChoice('selected')}>
                Выделенный слой
              </ChoiceChip>
            )}
            {sceneRef && (
              <ChoiceChip active={activeChoice === 'scene'} onClick={() => setRefChoice('scene')}>
                Главный кадр сцены
              </ChoiceChip>
            )}
            <ChoiceChip active={activeChoice === 'none'} onClick={() => setRefChoice('none')}>
              Без референса
            </ChoiceChip>
          </div>
        )}
      </div>

      {extraSlots.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs">Ещё референсы для модели</Label>
          <div className="flex flex-wrap gap-2">
            {extraSlots.map((slot) => {
              const ref = slotRefs[slot.key];
              return (
                <button
                  key={slot.key}
                  type="button"
                  onClick={() => {
                    if (ref) {
                      setSlotRefs((current) => {
                        const next = { ...current };
                        delete next[slot.key];
                        return next;
                      });
                      return;
                    }
                    pendingSlotRef.current = slot.key;
                    fileInputRef.current?.click();
                  }}
                  title={ref ? 'Убрать референс' : `Прикрепить: ${slot.label}`}
                  className={cn(
                    'relative h-16 w-16 overflow-hidden rounded-lg border text-[10px] transition',
                    ref ? 'border-violet-400' : 'border-dashed border-slate-700 text-slate-500 hover:border-slate-500',
                  )}
                >
                  {slotBusy === slot.key ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin text-violet-300" />
                  ) : ref ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={mediaUrl(ref) ?? ''} alt="" className="h-full w-full object-cover" />
                      <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-slate-950/80 text-slate-200">
                        <X className="h-3 w-3" />
                      </span>
                    </>
                  ) : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 px-1">
                      <Plus className="h-3.5 w-3.5" />
                      {slot.label}
                      {slot.required && <span className="text-amber-300">обяз.</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Модель принимает {slots.length} референс{slots.length > 4 ? 'ов' : slots.length > 1 ? 'а' : ''}:
            например, объединить два фото в один кадр.
          </p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          const slotKey = pendingSlotRef.current;
          pendingSlotRef.current = null;
          if (!file || !slotKey) return;
          setSlotBusy(slotKey);
          const url = await onUploadReference(file);
          setSlotBusy(null);
          if (url) setSlotRefs((current) => ({ ...current, [slotKey]: url }));
        }}
      />

      {selectedLayer && (
        <div className="space-y-1.5">
          <Label className="text-xs">Куда положить результат</Label>
          <div className="flex flex-wrap gap-1.5">
            <ChoiceChip active={target === 'new'} onClick={() => setTarget('new')}>
              Новый слой поверх
            </ChoiceChip>
            <ChoiceChip active={target === 'selected'} onClick={() => setTarget('selected')}>
              Заменить выделенный
            </ChoiceChip>
          </div>
        </div>
      )}

      {hasManaged ? (
        <div className="space-y-3">
          <PresetTiles
            title="Сцены"
            presets={managedSolo}
            activeId={activePreset}
            onPick={(text, id) => {
              setPrompt(text);
              setActivePreset(id);
            }}
          />
          <PresetTiles
            title="Совместные кадры"
            hint="Работают, когда в сцене есть люди: прикрепите второй портрет референсом."
            presets={managedDuo}
            activeId={activePreset}
            onPick={(text, id) => {
              setPrompt(text);
              setActivePreset(id);
            }}
          />
        </div>
      ) : (
      <div className="space-y-2">
        <Label className="text-xs">Готовые сцены</Label>
        <div className="space-y-2">
          {SCENE_PRESET_GROUPS.map((group) => {
            const items = presets.filter((preset) => preset.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                  {SCENE_PRESET_GROUP_TITLES[group]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((preset) => (
                    <button
                      key={preset.code}
                      type="button"
                      title={preset.description}
                      onClick={() => {
                        setPrompt(preset.prompt);
                        setActivePreset(preset.code);
                      }}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition',
                        activePreset === preset.code
                          ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                          : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-violet-400/60 hover:text-white',
                      )}
                    >
                      {preset.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-4 space-y-3 border-t border-violet-500/30 bg-slate-950/95 px-4 pb-4 pt-3 backdrop-blur">
      <div className="space-y-2">
        <Label className="text-xs" htmlFor="scene-prompt">
          Описание сцены
        </Label>
        <Textarea
          id="scene-prompt"
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setActivePreset(null);
          }}
          rows={3}
          placeholder="Что должно происходить в кадре"
          className="text-sm"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-slate-400">
          Модель
          <select
            value={model?.slug ?? ''}
            onChange={(event) => setModelSlug(event.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
          >
            {models.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>
        </label>

        {isVideo && (
          <label className="text-xs text-slate-400">
            Длительность
            <div className="mt-1 flex gap-1.5">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDuration(option)}
                  className={cn(
                    'h-9 flex-1 rounded-md border text-sm transition',
                    duration === option
                      ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500',
                  )}
                >
                  {option}с
                </button>
              ))}
            </div>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canGenerate}
          onClick={() =>
            model &&
            onGenerate({
              modelSlug: model.slug,
              prompt: prompt.trim(),
              aspectRatio: aspectForTimeline(aspect),
              duration: isVideo ? duration : undefined,
              imageInputRef: reference?.source.url ?? slotRefs.main,
              params: Object.keys(slotParams).length > 0 ? slotParams : undefined,
              target: selectedLayer ? target : 'new',
            })
          }
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {running ? 'Генерируем…' : `Сгенерировать за ${formatTokens(price)}`}
        </Button>
        {!enoughCoins && <span className="text-xs text-amber-300">Не хватает коинов на балансе</span>}
      </div>
      </div>
    </section>
  );
}

/** Кнопка-переключатель: выбор здесь всегда из двух-трёх вариантов, выпадашка была бы тяжелее. */
function ChoiceChip({
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
        'rounded-full border px-3 py-1 text-xs transition',
        active
          ? 'border-violet-400 bg-violet-500/20 text-violet-100'
          : 'border-slate-700 text-slate-300 hover:border-slate-500',
      )}
    >
      {children}
    </button>
  );
}

/**
 * Плитка шаблонов сцены.
 *
 * Квадрат с превью читается быстрее строки текста: по картинке сразу видно, что получится.
 * Пока владелец не приложил превью, показываем заголовок на подложке — шаблон всё равно
 * рабочий, просто без картинки.
 */
function PresetTiles({
  title,
  hint,
  presets,
  activeId,
  onPick,
}: {
  title: string;
  hint?: string;
  presets: Array<{ id: string; title: string; description: string; promptText: string; thumbnail: string | null }>;
  activeId: string | null;
  onPick: (prompt: string, id: string) => void;
}) {
  if (presets.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{title}</Label>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
      <div className="grid grid-cols-3 gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.description}
            onClick={() => onPick(preset.promptText, preset.id)}
            className={cn(
              'group relative aspect-square overflow-hidden rounded-lg border bg-slate-900 transition',
              activeId === preset.id
                ? 'border-violet-400 ring-2 ring-violet-400/40'
                : 'border-slate-700 hover:border-violet-400',
            )}
          >
            {preset.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(preset.thumbnail) ?? preset.thumbnail} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
            )}
            <span className="absolute inset-x-0 bottom-0 bg-slate-950/80 px-1 py-0.5 text-[10px] leading-tight text-slate-200">
              {preset.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
