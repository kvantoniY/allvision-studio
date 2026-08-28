'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import {
  CHAT_MODELS,
  SCENE_PRESETS,
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
  onGenerate,
}: {
  scene: TimelineScene;
  aspect: TimelineAspect;
  balance: number;
  running: boolean;
  /** Выделенный на холсте медиа-слой: он же по умолчанию и референс, и место результата. */
  selectedLayer: MediaLayer | null;
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

  const presets = useMemo(
    () => SCENE_PRESETS.filter((preset) => (preset.needsPhoto ? hasImage : true)),
    [hasImage],
  );

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
              <div className="grid h-full w-full place-items-center text-[10px] text-slate-600">с нуля</div>
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
                      onClick={() => setPrompt(preset.prompt)}
                      className="rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300 transition hover:border-violet-400/60 hover:text-white"
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

      <div className="space-y-2">
        <Label className="text-xs" htmlFor="scene-prompt">
          Описание сцены
        </Label>
        <Textarea
          id="scene-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
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
              imageInputRef: reference?.source.url,
              target: selectedLayer ? target : 'new',
            })
          }
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {running ? 'Генерируем…' : `Сгенерировать за ${formatTokens(price)}`}
        </Button>
        {!enoughCoins && <span className="text-xs text-amber-300">Не хватает коинов на балансе</span>}
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
