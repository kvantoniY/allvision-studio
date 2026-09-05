'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Bookmark, Bot, ChevronDown, Download, Film, ImagePlus, ImageIcon, Layers3, Library, Paperclip, Play, PlayCircle, Plus, Sparkles, Trash2, UploadCloud, UserRound, Video, Volume2, Wand2, Zap } from 'lucide-react';
import {
  CHAT_MODELS,
  type PublicService,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImageWithSkeleton } from '@/components/ui/image-with-skeleton';
import { PreviewVideo } from '@/components/ui/preview-video';
import {
  EditableMedia,
  EditableText,
  HomeAdminToolbar,
  HomeMediaEditorModal,
  HomeServiceSlotEditorModal,
  HomeTextEditorModal,
  type HomeEditorController,
  type HomeEditorPath,
  type HomeMediaEditState,
  type HomeServiceSlotEditState,
  type HomeTextEditState,
} from '@/components/pages/HomePageInlineEditor';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { giftServicePriceFrom } from '@/lib/gift-factory';
import { AmbientBackground } from '@/components/home/AmbientBackground';
import { GreetingsHero } from '@/components/home/GreetingsHero';
import { Reveal } from '@/components/home/Reveal';
import { mergeHomeLandingContent, type HomeLandingContent, type HomeMedia, type HomeModelFamily, type HomeTrendingSlot } from '@/lib/home-landing-content';
import { useUpdateAdminHomePageContentMutation } from '@/store/api/admin-home-page-api';
import { useGetHomePageContentQuery } from '@/store/api/public-api';
import { useListServicesQuery } from '@/store/api/services-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

/*
 * Бейдж на карточке. Цвет тона задаёт свечение, а не только рамку: на тёмном
 * фоне подсвеченная плашка читается как метка, а бледная — как поле ввода.
 */
const toneClasses: Record<HomeTrendingSlot['tone'], string> = {
  violet: 'border-violet-300/60 bg-violet-500/20 text-violet-50 shadow-[0_0_20px_-6px_rgba(139,92,246,0.9)]',
  amber: 'border-amber-200/70 bg-amber-400/25 text-amber-50 shadow-[0_0_20px_-6px_rgba(251,191,36,0.9)]',
  cyan: 'border-cyan-200/60 bg-cyan-400/20 text-cyan-50 shadow-[0_0_20px_-6px_rgba(34,211,238,0.9)]',
  rose: 'border-rose-200/60 bg-rose-500/20 text-rose-50 shadow-[0_0_20px_-6px_rgba(244,63,94,0.9)]',
};

/*
 * Карточка семейства моделей. Цвет живёт в подсветке и в свечении под карточкой,
 * а подложка у всех одна тёмная: иначе шесть разноцветных прямоугольников рядом
 * читаются как набор наклеек, а не как один каталог.
 */
const modelAccentClasses: Record<HomeModelFamily['accent'], string> = {
  violet: 'border-violet-400/35 text-violet-200 hover:border-violet-300/70 hover:shadow-[0_18px_46px_-24px_rgba(139,92,246,0.95)]',
  cyan: 'border-cyan-300/35 text-cyan-200 hover:border-cyan-200/70 hover:shadow-[0_18px_46px_-24px_rgba(34,211,238,0.95)]',
  emerald: 'border-emerald-300/35 text-emerald-200 hover:border-emerald-200/70 hover:shadow-[0_18px_46px_-24px_rgba(16,185,129,0.95)]',
  amber: 'border-amber-300/35 text-amber-200 hover:border-amber-200/70 hover:shadow-[0_18px_46px_-24px_rgba(251,191,36,0.95)]',
  rose: 'border-rose-300/35 text-rose-200 hover:border-rose-200/70 hover:shadow-[0_18px_46px_-24px_rgba(244,63,94,0.95)]',
  sky: 'border-sky-300/35 text-sky-200 hover:border-sky-200/70 hover:shadow-[0_18px_46px_-24px_rgba(56,189,248,0.95)]',
};

/*
 * Иконки к примерам запросов в блоке чата. Список запросов админ правит текстом,
 * поэтому оформление привязано к позиции, а не к содержимому: три записи, три
 * узнаваемых значка (ролик, картинка, персонаж), дальше по кругу.
 */
const promptAccents = [
  { icon: <Film className="h-5 w-5 text-violet-200" />, accent: 'border-violet-300/40 bg-violet-500/15' },
  { icon: <ImageIcon className="h-5 w-5 text-cyan-200" />, accent: 'border-cyan-300/40 bg-cyan-500/15' },
  { icon: <UserRound className="h-5 w-5 text-amber-200" />, accent: 'border-amber-300/40 bg-amber-500/15' },
];

/**
 * Заголовок с цветным хвостом.
 *
 * Последние слова уходят в градиент — так строка получает акцент, не превращаясь
 * целиком в цветное пятно (сплошной градиентный заголовок хуже читается). Сколько
 * слов красить, решаем по длине: в короткой фразе двух цветных слов из трёх было бы
 * слишком много.
 *
 * Текст при этом остаётся одной строкой в данных: редактору главной уходит исходное
 * значение, разбивка живёт только в разметке.
 */
function GradientTail({ text }: { text: string }) {
  const words = text.trim().split(/\s+/);
  if (words.length < 2) return <span className="av-text-gradient">{text}</span>;

  const accentCount = words.length >= 4 ? 2 : 1;
  const head = words.slice(0, words.length - accentCount).join(' ');
  const tail = words.slice(words.length - accentCount).join(' ');

  return (
    <>
      {head} <span className="av-text-gradient">{tail}</span>
    </>
  );
}

function sectionAttrs(section: string) {
  return { 'data-home-section': section };
}

function fieldAttrs(section: string, field: string) {
  return { 'data-home-section': section, 'data-home-field': field };
}

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function serviceMedia(service?: PublicService): HomeMedia | null {
  if (!service) return null;
  const video = mediaUrl(service.previewVideo);
  const image = mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]);
  if (service.previewMode === 'image' && image) {
    return { type: 'image', url: image, alt: service.title };
  }
  if (service.previewMode === 'video' && video) {
    return { type: 'video', url: video, alt: service.title };
  }
  if (video) {
    return { type: 'video', url: video, alt: service.title };
  }
  if (image) {
    return { type: 'image', url: image, alt: service.title };
  }
  return { type: 'image', url: '/mock_preview.png', alt: service.title };
}

function actionHref(path: string, isAuthed: boolean) {
  return isAuthed ? path : '/register';
}

function cloneContent(content: HomeLandingContent) {
  return JSON.parse(JSON.stringify(content)) as HomeLandingContent;
}

function updateContentAtPath(content: HomeLandingContent, path: HomeEditorPath, value: unknown) {
  const next = cloneContent(content);
  let cursor: any = next;

  path.slice(0, -1).forEach((part) => {
    cursor = cursor[part as any];
  });

  const last = path[path.length - 1];
  cursor[last as any] = value;
  return next;
}

export function HomePageContent() {
  const { user } = useAuth();
  const isAuthed = !!user;
  const services = useListServicesQuery();
  const homePage = useGetHomePageContentQuery();
  const [updateHomePage, updateHomePageState] = useUpdateAdminHomePageContentMutation();
  const mergedContent = useMemo(() => mergeHomeLandingContent(homePage.data?.content), [homePage.data?.content]);
  const [content, setContent] = useState<HomeLandingContent>(mergedContent);
  const [editMode, setEditMode] = useState(false);
  const [textEdit, setTextEdit] = useState<HomeTextEditState | null>(null);
  const [mediaEdit, setMediaEdit] = useState<HomeMediaEditState | null>(null);
  const [serviceSlotEdit, setServiceSlotEdit] = useState<HomeServiceSlotEditState | null>(null);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    setContent(mergedContent);
  }, [mergedContent]);

  const saveContentValue = (path: HomeEditorPath, value: unknown) => {
    const next = updateContentAtPath(content, path, value);
    setContent(next);
    void updateHomePage({ content: next });
  };

  const editor: HomeEditorController | undefined = isAdmin
    ? {
        enabled: editMode,
        saving: updateHomePageState.isLoading,
        openTextEditor: setTextEdit,
        openMediaEditor: setMediaEdit,
        openServiceSlotEditor: setServiceSlotEdit,
        setValue: saveContentValue,
      }
    : undefined;

  // Раньше тут был «if (isAuthLoading) return <Skeleton>». На сервере useAuth всегда
  // в состоянии загрузки, поэтому краулеры (Google) получали главную из пустых скелетонов
  // без контента и индексировали вместо неё контентные страницы (pd-consent). Теперь лендинг
  // рендерится на сервере с реальным текстом; isAuthed (false при загрузке) влияет только на
  // ссылки CTA, а не на разметку, поэтому контент для поисковиков всегда в HTML.
  const allServices = services.data?.services ?? [];

  return (
    <main className="relative min-w-0 text-slate-100">
      {/*
       * Свет и звёзды нарисованы один раз на всю страницу. Раньше у каждой секции
       * было своё размытое пятно: это и стоило дороже, и давало «лоскутный» фон,
       * где границы блоков читались по смене подсветки.
       */}
      <AmbientBackground />
      {isAdmin && (
        <HomeAdminToolbar
          enabled={editMode}
          saving={updateHomePageState.isLoading}
          onToggle={() => setEditMode((current) => !current)}
        />
      )}
      {/*
       * Готовые услуги открывают страницу: это главный товар витрины, и он должен
       * попадаться на глаза до того, как человек начнёт листать что-либо ещё.
       * Видео-поздравления идут вторым экраном.
       */}
      <ServicesShowcase content={content} editor={editor} services={allServices} isLoading={services.isLoading} />
      <GreetingsHero content={content} editor={editor} />
      <HeroLanding content={content} editor={editor} services={allServices} isAuthed={isAuthed} />
      <ChatSection content={content} editor={editor} isAuthed={isAuthed} />
      <ModelCatalogSection content={content} editor={editor} />
      <StudioPricingSection content={content} editor={editor} isAuthed={isAuthed} />
      <FinalCta content={content} editor={editor} isAuthed={isAuthed} />
      <HomeTextEditorModal
        edit={textEdit}
        saving={updateHomePageState.isLoading}
        onClose={() => setTextEdit(null)}
        onSave={(path, value) => {
          saveContentValue(path, value);
          setTextEdit(null);
        }}
      />
      <HomeMediaEditorModal
        edit={mediaEdit}
        saving={updateHomePageState.isLoading}
        onClose={() => setMediaEdit(null)}
        onSave={(path, media) => {
          saveContentValue(path, media);
          setMediaEdit(null);
        }}
      />
      <HomeServiceSlotEditorModal
        edit={serviceSlotEdit}
        services={allServices}
        saving={updateHomePageState.isLoading}
        onClose={() => setServiceSlotEdit(null)}
        onSave={(path, serviceSlug) => {
          saveContentValue(path, serviceSlug);
          setServiceSlotEdit(null);
        }}
      />
    </main>
  );
}

/**
 * Популярные сценарии.
 *
 * Раньше это был первый экран целиком — с заголовком, кнопками и «трендом недели». Теперь
 * страницу открывают видео-поздравления, а здесь остаётся то, ради чего блок и был нужен:
 * подборка готовых сценариев, которую админ собирает в редакторе главной.
 */
function HeroLanding({
  content,
  editor,
  services,
  isAuthed,
}: {
  content: HomeLandingContent;
  editor?: HomeEditorController;
  services: PublicService[];
  isAuthed: boolean;
}) {
  const serviceBySlug = new Map(services.map((service) => [service.slug, service]));

  return (
    <section className="relative" {...sectionAttrs(content.trending.sectionKey)}>
      <div className="av-divider mx-auto max-w-[1480px]" />
      <div className="relative mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8">
        <Reveal className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl" {...fieldAttrs(content.trending.sectionKey, 'title')}>
              <EditableText editor={editor} path={['trending', 'title']} label="Заголовок трендовых услуг" value={content.trending.title} multiline>
                <GradientTail text={content.trending.title} />
              </EditableText>
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400" {...fieldAttrs(content.trending.sectionKey, 'description')}>
              <EditableText editor={editor} path={['trending', 'description']} label="Описание трендовых услуг" value={content.trending.description} multiline>
                {content.trending.description}
              </EditableText>
            </p>
          </div>
          <Link href="/services" className="inline-flex items-center gap-2 text-sm font-medium text-amber-300 transition hover:text-amber-200">
            Весь каталог
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {content.trending.slots.map((slot, index) => (
            <Reveal key={slot.slotId} delayMs={index * 70}>
              <TrendingServiceCard
                slot={slot}
                slotIndex={index}
                editor={editor}
                service={serviceBySlug.get(slot.serviceSlug)}
                isAuthed={isAuthed}
              />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrendingServiceCard({
  slot,
  slotIndex,
  editor,
  service,
  isAuthed,
}: {
  slot: HomeTrendingSlot;
  slotIndex: number;
  editor?: HomeEditorController;
  service?: PublicService;
  isAuthed: boolean;
}) {
  const title = service?.title ?? slot.title ?? 'Услуга';
  const description = service?.shortDesc ?? slot.description ?? 'Выберите услугу из каталога';
  const media = serviceMedia(service) ?? slot.media ?? { type: 'image' as const, url: '/mock_preview.png', alt: title };
  const price = service ? giftServicePriceFrom(service) : null;

  return (
    <Link
      href={isAuthed ? `/services/${service?.slug ?? slot.serviceSlug}` : '/register'}
      className="group block min-w-0"
      {...sectionAttrs(`trending-services.${slot.slotId}`)}
    >
      <article className="av-card av-card-hover av-card-quiet h-full overflow-hidden rounded-2xl">
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
          <MediaBlock media={media} className="transition duration-500 group-hover:scale-105" />
          <div className={cn('absolute left-3 top-3 rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur', toneClasses[slot.tone])}>
            Тренд
          </div>
          {editor?.enabled && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                editor.openServiceSlotEditor({
                  path: ['trending', 'slots', slotIndex, 'serviceSlug'],
                  label: `Услуга карточки: ${title}`,
                  value: slot.serviceSlug,
                });
              }}
              className="absolute right-3 top-3 z-30 inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-amber-400 hover:text-slate-950"
            >
              <Library className="h-3.5 w-3.5" />
              Услуга
            </button>
          )}
        </div>
        <div className="space-y-2.5 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 min-w-0 text-base font-bold text-white" {...fieldAttrs(`trending-services.${slot.slotId}`, 'title')}>
              {title}
            </h3>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-amber-300 transition group-hover:translate-x-1" />
          </div>
          <p className="line-clamp-2 text-sm leading-5 text-slate-400" {...fieldAttrs(`trending-services.${slot.slotId}`, 'description')}>
            {description}
          </p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="av-text-gradient font-bold">{price ? `от ${price} токенов` : 'быстрый старт'}</span>
            <span className="text-slate-500">2-5 мин</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function ChatSection({ content, editor, isAuthed }: { content: HomeLandingContent; editor?: HomeEditorController; isAuthed: boolean }) {
  const chat = content.chat;

  return (
    <section className="relative" {...sectionAttrs(chat.sectionKey)}>
      <div className="av-divider mx-auto max-w-[1480px]" />
      <div className="relative mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,0.84fr)_minmax(420px,1fr)] lg:items-center lg:px-8 lg:py-16 xl:gap-12">
        <div className="max-w-xl">
          <SectionEyebrow icon={<Bot className="h-4 w-4" />} text={chat.eyebrow} section={chat.sectionKey} editor={editor} path={['chat', 'eyebrow']} label="Бейдж блока чата" />
          <h2 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl xl:text-5xl" {...fieldAttrs(chat.sectionKey, 'title')}>
            <EditableText editor={editor} path={['chat', 'title']} label="Заголовок блока чата" value={chat.title} multiline>
              <GradientTail text={chat.title} />
            </EditableText>
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-400" {...fieldAttrs(chat.sectionKey, 'lead')}>
            <EditableText editor={editor} path={['chat', 'lead']} label="Описание блока чата" value={chat.lead} multiline>
              {chat.lead}
            </EditableText>
          </p>
          <div className="mt-6 grid gap-3">
            {chat.prompts.map((prompt, index) => {
              const { icon, accent } = promptAccents[index % promptAccents.length];
              return (
                <div
                  key={`${prompt}-${index}`}
                  className="av-card av-card-quiet group flex items-center gap-3.5 rounded-xl p-3.5 transition hover:-translate-y-0.5"
                  {...fieldAttrs(chat.sectionKey, `prompt-${index}`)}
                >
                  {/* Иконка в подсвеченном квадрате: строка запроса перестаёт быть просто списком. */}
                  <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-lg border', accent)}>{icon}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium leading-6 text-slate-100">
                    <EditableText editor={editor} path={['chat', 'prompts', index]} label="Пример запроса" value={prompt} multiline>
                      {prompt}
                    </EditableText>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-amber-300" />
                </div>
              );
            })}
          </div>

          {/*
           * Кнопка переехала из мокапа сюда. В мокапе она конкурировала с самим
           * интерфейсом на картинке: два призыва нажать в одном кадре. Слева она
           * заканчивает мысль текста и стоит там, где взгляд уже находится.
           */}
          <Button asChild size="lg" className="av-btn-gradient av-orbit mt-7 h-12 px-7 text-base font-bold">
            <Link href={actionHref('/ai', isAuthed)}>
              <Sparkles className="h-4 w-4" />
              Открыть Allvision AI
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/*
         * Мокап интерфейса. Всё внутри — картинка продукта, а не рабочие элементы:
         * поля и кнопки здесь не кликаются и убраны из порядка обхода (`aria-hidden`),
         * чтобы с клавиатуры не проваливаться в декорации. Настоящий переход — одна
         * кнопка в левой колонке.
         */}
        <div className="av-tilt av-card av-card-violet av-glow-violet min-w-0 rounded-3xl p-2.5 sm:p-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/85">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-3.5">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Sparkles className="h-4 w-4 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                Allvision AI
              </div>
              {/* Сегментированный переключатель: видно, что режимов три и один выбран. */}
              <div aria-hidden className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/70 p-1 text-xs">
                <span className="av-segment-active rounded-md px-3 py-1.5 font-bold text-amber-200">Фото</span>
                <span className="rounded-md px-3 py-1.5 text-slate-400">Видео</span>
                <span className="rounded-md px-3 py-1.5 text-slate-400">Звук</span>
              </div>
            </div>

            <div className="space-y-3 p-3 sm:p-4">
              <ChatMockRow label="Промпт" value={chat.mock.prompt} editor={editor} path={['chat', 'mock', 'prompt']} />

              <div className="grid gap-3 sm:grid-cols-3">
                <ChatMockControl label="Модель" value="Veo / Kling / Sora" trailing={<ChevronDown className="h-4 w-4" />} />
                <ChatMockControl label="Формат" value="9:16" trailing={<ChevronDown className="h-4 w-4" />} />
                <ChatMockControl label="Референс" value="Прикрепить" leading={<Paperclip className="h-4 w-4 text-amber-300" />} />
              </div>

              <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/70">
                <div className="relative aspect-[16/8] bg-slate-950">
                  <EditableMedia editor={editor} path={['chat', 'mock', 'media']} label="Медиа примера чата" media={chat.mock.media} className="absolute inset-0">
                    <MediaBlock media={chat.mock.media} />
                  </EditableMedia>
                  {/* Кнопка play поверх кадра: сразу понятно, что на выходе ролик. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/30 bg-slate-950/45 backdrop-blur-sm"
                  >
                    <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                  </span>
                </div>

                <div className="flex flex-col justify-between gap-3 p-3.5 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">
                      <EditableText editor={editor} path={['chat', 'mock', 'resultTitle']} label="Заголовок результата в мокапе" value={chat.mock.resultTitle}>
                        {chat.mock.resultTitle}
                      </EditableText>
                    </div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      <EditableText editor={editor} path={['chat', 'mock', 'resultDescription']} label="Описание результата в мокапе" value={chat.mock.resultDescription} multiline>
                        {chat.mock.resultDescription}
                      </EditableText>
                    </div>
                  </div>
                  {/* Три действия над готовым файлом — скачать, сохранить в Студию, оставить у себя. */}
                  <div aria-hidden className="flex shrink-0 gap-2">
                    <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/12 bg-slate-950/70 text-slate-300">
                      <Download className="h-4 w-4" />
                    </span>
                    <span className="grid h-10 w-10 place-items-center rounded-lg border border-white/12 bg-slate-950/70 text-slate-300">
                      <UploadCloud className="h-4 w-4" />
                    </span>
                    <span className="grid h-10 w-10 place-items-center rounded-lg border border-amber-300/60 bg-amber-400/15 text-amber-200 shadow-[0_0_20px_-8px_rgba(251,191,36,0.95)]">
                      <Bookmark className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ModelCatalogSection({ content, editor }: { content: HomeLandingContent; editor?: HomeEditorController }) {
  const models = content.models;
  const audioModels = CHAT_MODELS.filter((model) => model.supportsAudio).length;

  return (
    <section className="relative" {...sectionAttrs(models.sectionKey)}>
      <div className="av-divider mx-auto max-w-[1480px]" />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-2xl">
            <SectionEyebrow icon={<Layers3 className="h-4 w-4" />} text={models.eyebrow} section={models.sectionKey} editor={editor} path={['models', 'eyebrow']} label="Бейдж блока моделей" />
            <h2 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl lg:text-5xl" {...fieldAttrs(models.sectionKey, 'title')}>
              <EditableText editor={editor} path={['models', 'title']} label="Заголовок блока моделей" value={models.title} multiline>
                <GradientTail text={models.title} />
              </EditableText>
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg" {...fieldAttrs(models.sectionKey, 'lead')}>
              <EditableText editor={editor} path={['models', 'lead']} label="Описание блока моделей" value={models.lead} multiline>
                {models.lead}
              </EditableText>
            </p>
            <div className="mt-7 grid grid-cols-3 gap-3">
              <StatPill value={`${CHAT_MODELS.length}+`} label="моделей" />
              <StatPill value={`${audioModels}`} label="со звуком" />
              <StatPill value="1" label="чат" />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {models.families.map((family, index) => (
              <Reveal
                key={family.key}
                as="article"
                delayMs={(index % 3) * 80}
                className={cn(
                  'rounded-2xl border bg-slate-950/60 p-4 backdrop-blur-sm transition duration-300 hover:-translate-y-1',
                  modelAccentClasses[family.accent],
                )}
                {...sectionAttrs(`${models.sectionKey}.${family.key}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-bold text-white" {...fieldAttrs(`${models.sectionKey}.${family.key}`, 'title')}>
                    <EditableText editor={editor} path={['models', 'families', index, 'title']} label="Название семейства моделей" value={family.title}>
                      {family.title}
                    </EditableText>
                  </h3>
                  {family.key === 'audio-video' ? <Volume2 className="h-5 w-5" /> : <Video className="h-5 w-5" />}
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-300" {...fieldAttrs(`${models.sectionKey}.${family.key}`, 'description')}>
                  <EditableText editor={editor} path={['models', 'families', index, 'description']} label="Описание семейства моделей" value={family.description} multiline>
                    {family.description}
                  </EditableText>
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {family.models.map((model) => (
                    <span key={model} className="rounded-full border border-white/10 bg-slate-950/45 px-2.5 py-1 text-xs text-slate-200">
                      {model}
                    </span>
                  ))}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Сколько карточек услуг показываем сразу и сколько добавляет «Показать больше». */
const SHOWCASE_PAGE_SIZE = 6;

function ServicesShowcase({
  content,
  editor,
  services,
  isLoading,
}: {
  content: HomeLandingContent;
  editor?: HomeEditorController;
  services: PublicService[];
  isLoading: boolean;
}) {
  const readyServices = content.readyServices;
  const slugs = readyServices.serviceSlugs ?? [];
  const serviceBySlug = new Map(services.map((service) => [service.slug, service]));

  /*
   * Показываем две полных строки по три карточки, остальное — по кнопке. Шесть
   * штук дают понять, что каталог не из трёх позиций, и при этом не превращают
   * первый экран в бесконечную сетку.
   *
   * В режиме редактирования показываем всё: админ управляет составом блока и
   * должен видеть каждый слот, включая скрытые за кнопкой.
   */
  const [visibleCount, setVisibleCount] = useState(SHOWCASE_PAGE_SIZE);
  const editing = editor?.enabled ?? false;
  const visibleSlugs = editing ? slugs : slugs.slice(0, visibleCount);
  const hiddenCount = slugs.length - visibleSlugs.length;

  const removeAt = (index: number) => {
    const next = slugs.filter((_, i) => i !== index);
    editor?.setValue(['readyServices', 'serviceSlugs'], next);
  };

  const addService = () => {
    editor?.openServiceSlotEditor({
      path: ['readyServices', 'serviceSlugs', slugs.length],
      label: 'Добавить услугу в блок',
      value: '',
    });
  };

  return (
    <section className="relative" {...sectionAttrs(readyServices.sectionKey)}>
      <div className="relative mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Reveal className="mb-8">
          <SectionEyebrow icon={<Zap className="h-4 w-4" />} text={readyServices.eyebrow} section={readyServices.sectionKey} editor={editor} path={['readyServices', 'eyebrow']} label="Бейдж блока услуг" />
          {/*
           * Заголовок и кнопка стоят на одной линии: кнопка — продолжение мысли
           * заголовка, а не подпись к абзацу под ним. Описание уходит третьей
           * строкой и ширину кнопки не двигает.
           */}
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
            <h2 className="max-w-3xl text-3xl font-black tracking-normal text-white sm:text-4xl" {...fieldAttrs(readyServices.sectionKey, 'title')}>
              <EditableText editor={editor} path={['readyServices', 'title']} label="Заголовок блока услуг" value={readyServices.title} multiline>
                <GradientTail text={readyServices.title} />
              </EditableText>
            </h2>
            <Button asChild size="lg" className="av-btn-gradient h-12 shrink-0 px-6 text-base font-bold">
              <Link href="/services">
                <EditableText editor={editor} path={['readyServices', 'cta']} label="Текст кнопки услуг" value={readyServices.cta}>
                  {readyServices.cta}
                </EditableText>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400" {...fieldAttrs(readyServices.sectionKey, 'lead')}>
            <EditableText editor={editor} path={['readyServices', 'lead']} label="Описание блока услуг" value={readyServices.lead} multiline>
              {readyServices.lead}
            </EditableText>
          </p>
        </Reveal>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-lg bg-slate-900" />)}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleSlugs.map((slug, index) => (
              <Reveal
                key={`${slug}-${index}`}
                delayMs={(index % 3) * 90}
                className="min-w-0"
              >
                <ServiceShowcaseSlot
                  slug={slug}
                  index={index}
                  service={serviceBySlug.get(slug)}
                  editor={editor}
                  onRemove={() => removeAt(index)}
                  onChange={() =>
                    editor?.openServiceSlotEditor({
                      path: ['readyServices', 'serviceSlugs', index],
                      label: 'Заменить услугу в блоке',
                      value: slug,
                    })
                  }
                />
              </Reveal>
            ))}
            {editor?.enabled && (
              <button
                type="button"
                onClick={addService}
                className="grid min-h-[18rem] place-items-center rounded-lg border border-dashed border-amber-300/40 bg-slate-900/40 text-amber-200 transition hover:border-amber-300 hover:bg-slate-900"
              >
                <span className="flex flex-col items-center gap-2 text-sm font-semibold">
                  <Plus className="h-7 w-7" />
                  Добавить услугу
                </span>
              </button>
            )}
            {slugs.length === 0 && !editing && (
              <div className="col-span-full rounded-lg border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-sm text-slate-400">
                Услуги для этого блока пока не выбраны.
              </div>
            )}
          </div>
        )}

        {/*
         * «Показать больше» досыпает ещё одну сетку, а не уводит на каталог: у
         * человека, который уже смотрит карточки, спрос простой — покажи ещё,
         * и уходить со страницы ради этого не нужно. Кнопка «Все услуги» наверху
         * остаётся для тех, кому нужен весь каталог с фильтрами.
         */}
        {hiddenCount > 0 && !isLoading && (
          <div className="mt-8 flex justify-center">
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => setVisibleCount((current) => current + SHOWCASE_PAGE_SIZE)}
              className="av-btn-glass h-12 px-7 text-base font-semibold text-white hover:text-white"
            >
              Показать больше
              <span className="ml-1 text-slate-400">({hiddenCount})</span>
            </Button>
          </div>
        )}
      </div>
      <div className="av-divider mx-auto max-w-[1480px]" />
    </section>
  );
}

function ServiceShowcaseSlot({
  slug,
  index,
  service,
  editor,
  onRemove,
  onChange,
}: {
  slug: string;
  index: number;
  service?: PublicService;
  editor?: HomeEditorController;
  onRemove: () => void;
  onChange: () => void;
}) {
  const editing = editor?.enabled ?? false;
  const editControls = editing ? (
    <div className="absolute right-3 top-3 z-30 flex gap-2" {...sectionAttrs(`ready-services.slot-${index}`)}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onChange();
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-amber-400 hover:text-slate-950"
      >
        <Library className="h-3.5 w-3.5" />
        Услуга
      </button>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-300/50 bg-slate-950/90 text-rose-200 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-rose-500 hover:text-white"
        aria-label="Убрать услугу из блока"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;

  if (!service) {
    return (
      <article className="relative flex min-h-[18rem] flex-col justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900/60 p-5 text-center">
        {editControls}
        <div className="text-sm font-semibold text-slate-200">Услуга недоступна</div>
        <div className="mt-1 break-all text-xs text-slate-500">{slug}</div>
      </article>
    );
  }

  const media = serviceMedia(service) ?? {
    type: 'image' as const,
    url: '/mock_preview.png',
    alt: service.title,
  };

  return (
    <div className="group relative block min-w-0">
      {editControls}
      <Link href={`/services/${service.slug}`} className="block h-full">
        {/*
          * Свечение по краю вместо плотной рамки: карточка читается как подсвеченная
          * работа, а не как поле формы. На наведении оно усиливается — обратная связь
          * без движения всей сетки.
          */}
        <article className="av-card av-card-hover flex h-full flex-col overflow-hidden rounded-2xl">
          <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
            <MediaBlock media={media} className="transition duration-500 group-hover:scale-105" />
            {/* Затемнение к низу кадра: заголовок под ним читается на любом превью. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950 to-transparent" />
          </div>
          {/*
           * Название и кнопка — на одной линии.
           *
           * Кнопка стояла отдельной строкой под заголовком, и подвал карточки занимал
           * вдвое больше места без всякой пользы. Название сжимается до одной строки с
           * многоточием (`truncate`), а кнопка не сжимается вовсе (`shrink-0`): длинное
           * имя услуги должно обрезаться само, а не выдавливать действие из карточки.
           */}
          <div className="flex flex-1 items-center justify-between gap-3 p-4">
            <h3 className="min-w-0 flex-1 truncate text-base font-bold text-white" title={service.title}>
              {service.title}
            </h3>
            <div className="shrink-0">
              <span className="av-btn-gradient inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold">
                К услуге
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </div>
        </article>
      </Link>
    </div>
  );
}

function StudioPricingSection({
  content,
  editor,
  isAuthed,
}: {
  content: HomeLandingContent;
  editor?: HomeEditorController;
  isAuthed: boolean;
}) {
  const studio = content.studio;

  return (
    <section className="relative" {...sectionAttrs(studio.sectionKey)}>
      <div className="av-divider mx-auto max-w-[1480px]" />
      <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {/*
         * Секция в одну колонку: карточка цен из неё убрана, и делить ширину больше
         * не с чем. Ряды идут сверху вниз — текст с кнопкой, кадр, три карточки — и
         * каждый занимает всю ширину, поэтому пустых углов не остаётся.
         */}
        <div>
          <div>
            <SectionEyebrow icon={<Library className="h-4 w-4" />} text={studio.eyebrow} section={studio.sectionKey} editor={editor} path={['studio', 'eyebrow']} label="Бейдж блока Студии" />
            <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-normal text-white sm:text-4xl lg:text-5xl" {...fieldAttrs(studio.sectionKey, 'title')}>
              <EditableText editor={editor} path={['studio', 'title']} label="Заголовок блока Студии" value={studio.title} multiline>
                <GradientTail text={studio.title} />
              </EditableText>
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400 sm:text-lg" {...fieldAttrs(studio.sectionKey, 'lead')}>
              <EditableText editor={editor} path={['studio', 'lead']} label="Описание блока Студии" value={studio.lead} multiline>
                {studio.lead}
              </EditableText>
            </p>
          </div>

          <Button asChild className="av-btn-gradient mt-7 h-11 w-fit px-5 font-bold">
            <Link href={actionHref('/studio', isAuthed)}>
              <Sparkles className="h-4 w-4" />
              <EditableText editor={editor} path={['studio', 'cta']} label="Текст кнопки Студии" value={studio.cta}>
                {studio.cta}
              </EditableText>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Кадр Студии — своя строка во всю ширину. */}
        <div className="av-card av-card-violet av-glow-violet overflow-hidden rounded-2xl">
          <div className="relative aspect-[16/9] lg:aspect-[21/9]">
            <EditableMedia editor={editor} path={['studio', 'media']} label="Картинка блока Студии" media={studio.media} className="absolute inset-0">
              <MediaBlock media={studio.media} />
            </EditableMedia>
          </div>
        </div>

        {/*
         * Преимущества Студии идут отдельной строкой сетки во всю ширину.
         *
         * Раньше они лежали внутри левой колонки, и получалось так: слева высокий столбец
         * с картинкой и тремя карточками, справа короткая карточка цены — а под ней до
         * самого низа пустой угол. Три карточки под обеими колонками закрывают этот угол
         * и выстраиваются по той же сетке, что и всё остальное на странице.
         */}
        <div className="grid gap-4 sm:grid-cols-3">
          {studio.items.map((item, index) => (
            <article key={item.key} className="av-card av-card-quiet rounded-2xl p-5 transition hover:-translate-y-1" {...sectionAttrs(`${studio.sectionKey}.${item.key}`)}>
              <h3 className="font-bold text-white" {...fieldAttrs(`${studio.sectionKey}.${item.key}`, 'title')}>
                <EditableText editor={editor} path={['studio', 'items', index, 'title']} label="Название преимущества Студии" value={item.title}>
                  {item.title}
                </EditableText>
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400" {...fieldAttrs(`${studio.sectionKey}.${item.key}`, 'description')}>
                <EditableText editor={editor} path={['studio', 'items', index, 'description']} label="Описание преимущества Студии" value={item.description} multiline>
                  {item.description}
                </EditableText>
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta({ content, editor, isAuthed }: { content: HomeLandingContent; editor?: HomeEditorController; isAuthed: boolean }) {
  const finalCta = content.finalCta;

  return (
    <section className="relative" {...sectionAttrs(finalCta.sectionKey)}>
      <div className="av-divider mx-auto max-w-[1480px]" />
      <div className="mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        {/* Финальный экран — самый яркий: последнее, что человек видит перед решением. */}
        <div className="av-card av-glow-amber relative overflow-hidden rounded-3xl">
          {/* Свет внутри карточки, чтобы она светилась изнутри, а не только по краю. */}
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 av-nebula-amber rounded-full" />
          <div className="pointer-events-none absolute -bottom-28 right-0 h-80 w-80 av-nebula-violet rounded-full" />
          <div className="relative grid gap-6 p-6 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-white sm:text-4xl" {...fieldAttrs(finalCta.sectionKey, 'title')}>
                <EditableText editor={editor} path={['finalCta', 'title']} label="Заголовок финального CTA" value={finalCta.title} multiline>
                  <GradientTail text={finalCta.title} />
                </EditableText>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base" {...fieldAttrs(finalCta.sectionKey, 'lead')}>
                <EditableText editor={editor} path={['finalCta', 'lead']} label="Описание финального CTA" value={finalCta.lead} multiline>
                  {finalCta.lead}
                </EditableText>
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="av-btn-gradient av-orbit h-12 px-6 text-base font-bold">
                <Link href={actionHref('/ai', isAuthed)}>
                  <Sparkles className="h-4 w-4" />
                  Allvision AI
                </Link>
              </Button>
              <Button asChild variant="outline" className="av-btn-glass h-12 px-6 text-base font-semibold text-white hover:text-white">
                <Link href="/services">Услуги</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MediaBlock({ media, className }: { media: HomeMedia; className?: string }) {
  const src = mediaUrl(media.url) ?? media.url;
  if (media.type === 'video') {
    return (
      <div className="relative h-full w-full">
        <PreviewVideo src={src} className={cn('h-full w-full object-cover', className)} />
      </div>
    );
  }

  return <ImageWithSkeleton wrapperClassName="h-full w-full" src={src} alt={media.alt} fallbackSrc="/mock_preview.png" className={cn('h-full w-full object-cover', className)} />;
}

function SectionEyebrow({
  icon,
  text,
  section,
  editor,
  path,
  label,
}: {
  icon: ReactNode;
  text: string;
  section: string;
  editor?: HomeEditorController;
  path?: HomeEditorPath;
  label?: string;
}) {
  return (
    <div className="av-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold text-slate-100" {...fieldAttrs(section, 'eyebrow')}>
      <span className="text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]">{icon}</span>
      {path ? (
        <EditableText editor={editor} path={path} label={label ?? 'Бейдж'} value={text}>
          {text}
        </EditableText>
      ) : (
        text
      )}
    </div>
  );
}

function ChatMockRow({
  label,
  value,
  editor,
  path,
}: {
  label: string;
  value: string;
  editor?: HomeEditorController;
  path?: HomeEditorPath;
}) {
  return (
    <div className="av-card av-card-quiet rounded-xl px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
          <span className="truncate text-[11px] text-slate-600">Опишите вашу идею детально…</span>
        </div>
        {/* Счётчик символов — деталь, по которой поле читается как настоящее. */}
        <span aria-hidden className="shrink-0 text-[11px] tabular-nums text-slate-600">
          230 / 2500
        </span>
      </div>
      <div className="mt-1.5 text-sm leading-6 text-slate-200">
        {path ? (
          <EditableText editor={editor} path={path} label="Промпт в мокапе чата" value={value} multiline>
            {value}
          </EditableText>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

/**
 * Поле управления в мокапе.
 *
 * Выглядит как выпадающий список: подпись сверху, значение снизу, шеврон справа.
 * Так читатель узнаёт привычный элемент интерфейса и понимает, что модель и формат
 * выбираются, а не заданы навсегда.
 */
function ChatMockControl({
  label,
  value,
  leading,
  trailing,
}: {
  label: string;
  value: string;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="av-card av-card-quiet min-w-0 rounded-xl px-3 py-2.5">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        {leading}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{value}</span>
        {trailing && <span className="shrink-0 text-slate-500">{trailing}</span>}
      </div>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="av-card av-card-quiet rounded-2xl p-4 transition hover:-translate-y-1">
      <div className="av-text-gradient text-2xl font-black">{value}</div>
      <div className="mt-1 text-xs text-slate-400">{label}</div>
    </div>
  );
}

