'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, Loader2, Plus, Settings2, Video, Wand2, X } from 'lucide-react';
import {
  CHAT_MODELS,
  chatReferenceSlots,
  estimateChatGenerationPriceCoins,
  formatTokens,
  primaryMediaLayer,
  type ChatAspectRatio,
  type ChatCategory,
  type MediaLayer,
  type TimelineAspect,
  type TimelineScene,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useGetChatModelsQuery } from '@/store/api/user-chat-api';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { ServiceIdeaCards, servicePriceCoins } from '@/components/editor/ServiceIdeaCards';
import { ServiceRunCard } from '@/components/editor/ServiceRunCard';
import type { EditorCatalogService } from '@/store/api/editor-catalog-api';
import {
  AdvancedParamField,
  advancedParamSections,
  defaultAdvancedParams,
  normaliseAdvancedParams,
  type ChatAdvancedParams,
} from '@/components/ai/advanced-params';
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
  tab = 'generate',
  onUploadReference,
  onGenerate,
  onRunService,
  runningServiceSlug,
}: {
  scene: TimelineScene;
  aspect: TimelineAspect;
  balance: number;
  running: boolean;
  /** Выделенный на холсте медиа-слой: он же по умолчанию и референс, и место результата. */
  selectedLayer: MediaLayer | null;
  /**
   * Что показываем: форму генерации или подборку готовых услуг.
   *
   * Раньше услуги висели прямо в форме и съедали половину панели, из-за чего собственная
   * генерация не помещалась на экран. Это два разных занятия, и вкладка честнее.
   */
  tab?: 'generate' | 'services';
  /** Загружает файл и возвращает публичную ссылку — тот же путь, что у материала сцены. */
  onUploadReference: (file: File) => Promise<string | null>;
  onGenerate: (request: SceneGenerationRequest) => void;
  /** Запуск услуги прямо отсюда: результат вернётся в кадр этой же сцены. */
  onRunService: (service: EditorCatalogService, values: Record<string, string>) => void;
  runningServiceSlug?: string | null;
}) {
  // Референс по умолчанию — тот кадр, который человек выделил. Если не выделен ничего,
  // берём главный кадр сцены: на сцене из одного слоя это одно и то же.
  const selectedRef = imageLayer(selectedLayer);
  const primary = primaryMediaLayer(scene);
  const sceneRef = selectedRef?.id === primary?.id ? null : imageLayer(primary);

  const [refChoice, setRefChoice] = useState<ReferenceChoice | null>(null);
  // Открытая услуга занимает панель целиком: человек смотрит обложку и описание, а не
  // ищет их среди полей генерации.
  const [openService, setOpenService] = useState<EditorCatalogService | null>(null);
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
  const [duration, setDuration] = useState(5);
  const [modelSlug, setModelSlug] = useState<string | null>(null);

  // Категория как в Allvision AI: сначала «что делаем» — фото или видео, и только потом
  // модель. Полтора десятка моделей вперемешку читать невозможно, а выбор здесь всегда один
  // из двух: получить кадр или получить ролик.
  const [category, setCategory] = useState<Exclude<ChatCategory, 'audio'>>('video');
  // Расширенные настройки живут в модалке: в панели им места нет, а у части моделей их
  // полтора десятка. Значения по умолчанию берём из каталога, чтобы окно не было пустым.
  const [advanced, setAdvanced] = useState<ChatAdvancedParams>({});
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const models = useMemo(() => {
    return CHAT_MODELS.filter((model) => {
      if (model.experimental) return false;
      if (model.category !== category) return false;
      // Кадр в сцене — это референс: подходят модели, умеющие принимать изображение.
      if (hasImage) return model.acceptsImageInput;
      return model.acceptsTextOnly;
    });
  }, [hasImage, category]);

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

  // Ключи параметров у моделей свои: перенести настройки от прошлой модели значит отправить
  // провайдеру поля, которых он не знает.
  const modelKey = model?.slug ?? null;
  useEffect(() => {
    const next = CHAT_MODELS.find((item) => item.slug === modelKey);
    setAdvanced(next ? defaultAdvancedParams(next) : {});
    setAdvancedOpen(false);
  }, [modelKey]);

  const advancedSections = useMemo(() => (model ? advancedParamSections(model) : []), [model]);

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

  // Первый слот изображения закрывается кадром сцены, если он выбран референсом.
  const firstImageSlot = slots.find((slot) => slot.mediaKind === 'image');
  const missingSlot = slots.find((slot) => {
    if (!slot.required) return false;
    if (reference && slot.key === firstImageSlot?.key) return false;
    return !slotRefs[slot.key];
  });

  const canGenerate = Boolean(model)
    && !running
    && enoughCoins
    && !missingSlot
    && (!model?.requiresPrompt || prompt.trim().length > 0);

  if (openService) {
    const running = runningServiceSlug === openService.slug;
    return (
      <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
        <ServiceRunCard
          service={openService}
          price={servicePriceCoins(openService)}
          sceneFrameUrl={reference?.source.url ?? null}
          onUploadReference={onUploadReference}
          running={running}
          onBack={() => setOpenService(null)}
          onRun={(values) => onRunService(openService, values)}
        />
      </section>
    );
  }

  // Одна строка вместо трёх блоков: что за референс и сколько их принимает модель.
  const captionParts: string[] = [];
  if (reference) {
    captionParts.push(activeChoice === 'selected' ? 'Референс — выделенный слой' : 'Референс — главный кадр сцены');
  } else if (slots.length === 0) {
    captionParts.push('Референса нет — генерация по одному описанию');
  }
  if (slots.length > 1) {
    captionParts.push(`модель принимает ${slots.length} референса`);
  }

  if (tab === 'services') {
    return (
      <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
        <ServiceIdeaCards onOpenService={setOpenService} runningSlug={runningServiceSlug ?? null} />
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
      {/*
       * Референсы — одной строкой квадратов. Главный кадр и слоты модели отвечают на один
       * и тот же вопрос «от чего считаем», и разводить их по двум блокам с заголовками
       * значило выталкивать саму форму за нижний край панели.
       */}
      <div className="space-y-1.5">
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {reference && (
            <button
              type="button"
              onClick={() => setRefChoice('none')}
              title="Убрать референс"
              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-violet-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(reference.source.url ?? '') ?? ''} alt="" className="h-full w-full object-cover" />
              <span className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-slate-950/80 text-slate-200">
                <X className="h-3 w-3" />
              </span>
            </button>
          )}

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
                title={ref ? `Убрать: ${slot.label}` : `Прикрепить: ${slot.label}`}
                className={cn(
                  'relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border text-[10px] transition',
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
                  <span className="flex h-full flex-col items-center justify-center gap-0.5 px-1 leading-tight">
                    <Plus className="h-3.5 w-3.5" />
                    {slot.label}
                    {slot.required && <span className="text-amber-300">обяз.</span>}
                  </span>
                )}
              </button>
            );
          })}

          {/* Модель без слотов всё равно должна принимать файл: иначе прикрепить нечем. */}
          {!reference && slots.length === 0 && (
            <button
              type="button"
              onClick={() => {
                pendingSlotRef.current = 'main';
                fileInputRef.current?.click();
              }}
              title="Прикрепить файл-референс"
              className="grid h-14 w-14 shrink-0 place-items-center gap-0.5 rounded-lg border border-dashed border-slate-700 text-[10px] text-slate-500 transition hover:border-slate-500"
            >
              <Plus className="h-3.5 w-3.5" />
              файл
            </button>
          )}
        </div>

        {captionParts.length > 0 && (
          <p className="text-[11px] leading-4 text-slate-500">{captionParts.join(' · ')}</p>
        )}

        {/* Чипы выбора стоят там же, где сами референсы: это уточнение к строке выше. */}
        {(selectedRef || sceneRef || selectedLayer) && (
          <div className="flex flex-wrap items-center gap-1">
            {selectedRef && (
              <ChoiceChip active={activeChoice === 'selected'} onClick={() => setRefChoice('selected')}>
                Выделенный
              </ChoiceChip>
            )}
            {sceneRef && (
              <ChoiceChip active={activeChoice === 'scene'} onClick={() => setRefChoice('scene')}>
                Кадр сцены
              </ChoiceChip>
            )}
            {(selectedRef || sceneRef) && (
              <ChoiceChip active={activeChoice === 'none'} onClick={() => setRefChoice('none')}>
                Без референса
              </ChoiceChip>
            )}
            {selectedLayer && (
              <>
                <span className="mx-0.5 text-[11px] text-slate-600">→</span>
                <ChoiceChip active={target === 'new'} onClick={() => setTarget('new')}>
                  Новым слоем
                </ChoiceChip>
                <ChoiceChip active={target === 'selected'} onClick={() => setTarget('selected')}>
                  Заменить
                </ChoiceChip>
              </>
            )}
          </div>
        )}
      </div>

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

      <div className="space-y-2">
        <Textarea
          id="scene-prompt"
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
          }}
          rows={2}
          placeholder="Что должно происходить в кадре"
          className="text-sm"
        />

        {/*
         * Категория, модель и настройки — одной строкой. Тремя блоками с подписями они
         * занимали половину панели, хотя выбор в каждом короткий.
         */}
        <div className="flex items-center gap-1.5">
          {([
            { code: 'image', title: 'Фото', icon: ImageIcon },
            { code: 'video', title: 'Видео', icon: Video },
          ] as const).map((option) => (
            <button
              key={option.code}
              type="button"
              onClick={() => {
                setCategory(option.code);
                setModelSlug(null);
              }}
              title={option.title}
              aria-label={option.title}
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-md border transition',
                category === option.code
                  ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500',
              )}
            >
              <option.icon className="h-4 w-4" />
            </button>
          ))}

          <select
            value={model?.slug ?? ''}
            onChange={(event) => setModelSlug(event.target.value)}
            aria-label="Модель"
            className="h-9 min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-sm text-slate-100"
          >
            {models.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAdvancedOpen(true)}
            disabled={advancedSections.length === 0}
            title={advancedSections.length === 0 ? 'У этой модели нет дополнительных настроек' : 'Расширенные настройки'}
            aria-label="Расширенные настройки"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-700 text-slate-300 transition hover:border-violet-400 hover:text-white disabled:opacity-40"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>

        {isVideo && (
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[11px] text-slate-500">Длина</span>
            {DURATION_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDuration(option)}
                className={cn(
                  'h-8 flex-1 rounded-md border text-xs transition',
                  duration === option
                    ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                    : 'border-slate-700 text-slate-300 hover:border-slate-500',
                )}
              >
                {option}с
              </button>
            ))}
          </div>
        )}

        <Button
          type="button"
          className="w-full"
          disabled={!canGenerate}
          onClick={() =>
            model &&
            onGenerate({
              modelSlug: model.slug,
              prompt: prompt.trim(),
              aspectRatio: aspectForTimeline(aspect),
              duration: isVideo ? duration : undefined,
              imageInputRef: reference?.source.url ?? slotRefs.main,
              // Слоты кладём последними: прикреплённый референс важнее значения из настроек.
              params: Object.keys({ ...normaliseAdvancedParams(advanced), ...slotParams }).length > 0
                ? { ...normaliseAdvancedParams(advanced), ...slotParams }
                : undefined,
              target: selectedLayer ? target : 'new',
            })
          }
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {running ? 'Генерируем…' : <>Сгенерировать за {formatTokens(price)}</>}
        </Button>

        {missingSlot && (
          <p className="text-[11px] text-amber-300">Прикрепите «{missingSlot.label}» — без него модель не запустится</p>
        )}
        {!enoughCoins && <p className="text-[11px] text-amber-300">Не хватает токенов на балансе</p>}
      </div>

      {advancedOpen && model && typeof document !== 'undefined' && createPortal((
        // Снизу шторкой на телефоне, окном по центру на большом экране — как в чате.
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAdvancedOpen(false)}
        >
          <div
            className="max-h-[85dvh] w-full space-y-3 overflow-y-auto rounded-t-2xl border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-2xl shadow-black/40 md:max-w-md md:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 shrink-0 text-violet-300" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white">Расширенные настройки</div>
                <div className="truncate text-[11px] text-slate-500">{model.title}</div>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(false)}
                aria-label="Закрыть"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {advancedSections.map((section) => (
              <div key={section.key} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</div>
                <div className="grid gap-2.5">
                  {section.params.map((param) => (
                    <AdvancedParamField
                      key={param.key}
                      param={param}
                      value={advanced[param.key]}
                      onChange={(next) => setAdvanced((current) => ({ ...current, [param.key]: next }))}
                    />
                  ))}
                </div>
              </div>
            ))}

            <div className="flex justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setAdvanced(defaultAdvancedParams(model))}
                className="text-xs text-slate-500 transition hover:text-slate-200"
              >
                Сбросить
              </button>
              <Button type="button" size="sm" onClick={() => setAdvancedOpen(false)}>Готово</Button>
            </div>
          </div>
        </div>
      ), document.body)}
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
