'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Bot, CheckCircle2, Film, ImagePlus, ImageIcon, Layers3, Library, MessageSquareText, PlayCircle, Sparkles, Video, Volume2, Wand2, Zap } from 'lucide-react';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  CHAT_MODELS,
  estimateChatGenerationCostCoins,
  type PublicService,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  EditableMedia,
  EditableText,
  HomeAdminToolbar,
  HomeMediaEditorModal,
  HomeTextEditorModal,
  type HomeEditorController,
  type HomeEditorPath,
  type HomeMediaEditState,
  type HomeTextEditState,
} from '@/components/pages/HomePageInlineEditor';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { giftServicePriceFrom } from '@/lib/gift-factory';
import { mergeHomeLandingContent, type HomeLandingContent, type HomeMedia, type HomeModelFamily, type HomeTrendingSlot } from '@/lib/home-landing-content';
import { useUpdateAdminHomePageContentMutation } from '@/store/api/admin-home-page-api';
import { useGetHomePageContentQuery, useGetTokenPackagesQuery } from '@/store/api/public-api';
import { useListServicesQuery } from '@/store/api/services-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

const toneClasses: Record<HomeTrendingSlot['tone'], string> = {
  violet: 'border-violet-400/45 bg-violet-500/10 text-violet-100',
  amber: 'border-amber-300/50 bg-amber-500/10 text-amber-100',
  cyan: 'border-cyan-300/45 bg-cyan-500/10 text-cyan-100',
  rose: 'border-rose-300/45 bg-rose-500/10 text-rose-100',
};

const modelAccentClasses: Record<HomeModelFamily['accent'], string> = {
  violet: 'border-violet-400/40 bg-violet-500/10 text-violet-200',
  cyan: 'border-cyan-300/40 bg-cyan-500/10 text-cyan-200',
  emerald: 'border-emerald-300/40 bg-emerald-500/10 text-emerald-200',
  amber: 'border-amber-300/40 bg-amber-500/10 text-amber-200',
  rose: 'border-rose-300/40 bg-rose-500/10 text-rose-200',
  sky: 'border-sky-300/40 bg-sky-500/10 text-sky-200',
};

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
  if (video) {
    return { type: 'video', url: video, alt: service.title };
  }
  const image = mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]);
  if (image) {
    return { type: 'image', url: image, alt: service.title };
  }
  return null;
}

function formatCoins(value: number) {
  return `${value} токенов`;
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
  const { user, isLoading: isAuthLoading } = useAuth();
  const isAuthed = !!user;
  const services = useListServicesQuery();
  const homePage = useGetHomePageContentQuery();
  const tokenPackages = useGetTokenPackagesQuery();
  const [updateHomePage, updateHomePageState] = useUpdateAdminHomePageContentMutation();
  const mergedContent = useMemo(() => mergeHomeLandingContent(homePage.data?.content), [homePage.data?.content]);
  const [content, setContent] = useState<HomeLandingContent>(mergedContent);
  const [editMode, setEditMode] = useState(false);
  const [textEdit, setTextEdit] = useState<HomeTextEditState | null>(null);
  const [mediaEdit, setMediaEdit] = useState<HomeMediaEditState | null>(null);
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
      }
    : undefined;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-slate-950 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1480px]">
          <Skeleton className="h-[520px] rounded-xl bg-slate-900" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-48 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const allServices = services.data?.services ?? [];
  const firstPackage = tokenPackages.data?.packages?.[0];

  return (
    <main className="min-w-0 bg-slate-950 text-slate-100">
      {isAdmin && (
        <HomeAdminToolbar
          enabled={editMode}
          saving={updateHomePageState.isLoading}
          onToggle={() => setEditMode((current) => !current)}
        />
      )}
      <HeroLanding content={content} editor={editor} services={allServices} isAuthed={isAuthed} />
      <ChatSection content={content} editor={editor} isAuthed={isAuthed} />
      <ModelCatalogSection content={content} editor={editor} />
      <ServicesShowcase content={content} editor={editor} services={allServices} isLoading={services.isLoading} />
      <BenefitsPricingSection content={content} editor={editor} isAuthed={isAuthed} starterPackage={firstPackage} />
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
    </main>
  );
}

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
  const featuredMedia = content.hero.featuredMedia;

  return (
    <section
      className="relative isolate overflow-hidden border-b border-slate-800 bg-slate-950"
      {...sectionAttrs(content.hero.sectionKey)}
    >
      <img
        src={mediaUrl(content.hero.media.url) ?? content.hero.media.url}
        alt={content.hero.media.alt}
        className="absolute inset-0 h-full w-full object-cover opacity-45"
      />
      <div className="absolute inset-0 bg-slate-950/72" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-slate-950" />
      {editor?.enabled && (
        <button
          type="button"
          onClick={() => {
            editor.openMediaEditor({
              path: ['hero', 'media'],
              label: 'Фон первого блока',
              media: content.hero.media,
            });
          }}
          className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-amber-100 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-amber-400 hover:text-slate-950 sm:left-6 lg:left-8"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Фон
        </button>
      )}

      <div className="relative mx-auto w-full max-w-[1480px] px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(340px,0.58fr)] lg:items-center xl:gap-12">
          <div className="max-w-3xl">
            <h1
              className="mt-5 max-w-3xl text-4xl font-black leading-[0.98] tracking-normal text-white sm:text-5xl xl:text-6xl"
              {...fieldAttrs(content.hero.sectionKey, 'title')}
            >
              <EditableText editor={editor} path={['hero', 'title']} label="Заголовок первого блока" value={content.hero.title} multiline>
                {content.hero.title}
              </EditableText>
            </h1>
            <p
              className="mt-5 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg"
              {...fieldAttrs(content.hero.sectionKey, 'lead')}
            >
              <EditableText editor={editor} path={['hero', 'lead']} label="Описание первого блока" value={content.hero.lead} multiline>
                {content.hero.lead}
              </EditableText>
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 bg-amber-500 px-5 text-slate-950 hover:bg-amber-400">
                <Link href={actionHref('/ai', isAuthed)}>
                  <Sparkles className="h-4 w-4" />
                  <EditableText editor={editor} path={['hero', 'primaryCta']} label="Текст основной кнопки" value={content.hero.primaryCta}>
                    {content.hero.primaryCta}
                  </EditableText>
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 border-white/20 bg-white/10 px-5 text-white hover:bg-white/15 hover:text-white">
                <Link href="/services">
                  <EditableText editor={editor} path={['hero', 'secondaryCta']} label="Текст второй кнопки" value={content.hero.secondaryCta}>
                    {content.hero.secondaryCta}
                  </EditableText>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="mt-6 grid max-w-xl gap-2.5 sm:grid-cols-3">
              {content.hero.stats.map((item, index) => (
                <div key={item.label} className="rounded-md border border-white/10 bg-white/10 p-3 backdrop-blur" {...fieldAttrs(content.hero.sectionKey, `stat-${index}`)}>
                  <div className="text-lg font-bold text-white">
                    <EditableText editor={editor} path={['hero', 'stats', index, 'value']} label="Значение статистики" value={item.value}>
                      {item.value}
                    </EditableText>
                  </div>
                  <div className="mt-1 text-xs text-slate-300">
                    <EditableText editor={editor} path={['hero', 'stats', index, 'label']} label="Подпись статистики" value={item.label}>
                      {item.label}
                    </EditableText>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="ml-auto max-w-[520px] overflow-hidden rounded-lg border border-white/15 bg-slate-950/70 shadow-2xl shadow-black/30">
              <div className="relative aspect-[5/4] max-h-[430px] bg-slate-900">
                {featuredMedia.type === 'video' ? (
                  <video src={mediaUrl(featuredMedia.url) ?? featuredMedia.url} className="h-full w-full object-cover" autoPlay loop muted playsInline />
                ) : (
                  <img
                    src={mediaUrl(featuredMedia.url) ?? featuredMedia.url}
                    alt={featuredMedia.alt}
                    className="h-full w-full object-cover"
                  />
                )}
                {editor?.enabled && (
                  <EditableMedia editor={editor} path={['hero', 'featuredMedia']} label="Медиа тренда недели" media={featuredMedia} className="absolute inset-0 z-20">
                    <span />
                  </EditableMedia>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 p-3.5">
                <div>
                  <div className="text-sm font-semibold text-white">
                    <EditableText editor={editor} path={['hero', 'featuredTitle']} label="Заголовок тренда недели" value={content.hero.featuredTitle}>
                      {content.hero.featuredTitle}
                    </EditableText>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    <EditableText editor={editor} path={['hero', 'featuredDescription']} label="Описание тренда недели" value={content.hero.featuredDescription} multiline>
                      {content.hero.featuredDescription}
                    </EditableText>
                  </div>
                </div>
                <PlayCircle className="h-8 w-8 text-amber-300" />
              </div>
            </div>
          </div>
        </div>

        <div className="relative mt-10" {...sectionAttrs(content.trending.sectionKey)}>
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-xl font-bold text-white sm:text-2xl" {...fieldAttrs(content.trending.sectionKey, 'title')}>
                <EditableText editor={editor} path={['trending', 'title']} label="Заголовок трендовых услуг" value={content.trending.title} multiline>
                  {content.trending.title}
                </EditableText>
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300" {...fieldAttrs(content.trending.sectionKey, 'description')}>
                <EditableText editor={editor} path={['trending', 'description']} label="Описание трендовых услуг" value={content.trending.description} multiline>
                  {content.trending.description}
                </EditableText>
              </p>
            </div>
            <Link href="/services" className="inline-flex items-center gap-2 text-sm font-medium text-amber-300 hover:text-amber-200">
              Весь каталог
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {content.trending.slots.map((slot, index) => (
              <TrendingServiceCard
                key={slot.slotId}
                slot={slot}
                slotIndex={index}
                editor={editor}
                service={serviceBySlug.get(slot.serviceSlug)}
                isAuthed={isAuthed}
              />
            ))}
          </div>
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
  const media = slot.media ?? serviceMedia(service);
  const title = slot.title;
  const description = slot.description;
  const price = service ? giftServicePriceFrom(service) : null;

  return (
    <Link
      href={isAuthed ? `/services/${service?.slug ?? slot.serviceSlug}` : '/register'}
      className="group block min-w-0"
      {...sectionAttrs(`trending-services.${slot.slotId}`)}
    >
      <article className="h-full overflow-hidden rounded-lg border border-white/10 bg-slate-900/80 transition duration-300 hover:-translate-y-1 hover:border-amber-300/60">
        <div className="relative aspect-[16/10] overflow-hidden bg-slate-950">
          <EditableMedia editor={editor} path={['trending', 'slots', slotIndex, 'media']} label={`Медиа карточки: ${title}`} media={media}>
            <MediaBlock media={media} className="transition duration-500 group-hover:scale-105" />
          </EditableMedia>
          <div className={cn('absolute left-3 top-3 rounded-full border px-2.5 py-1 text-xs font-semibold backdrop-blur', toneClasses[slot.tone])}>
            Тренд
          </div>
        </div>
        <div className="space-y-2.5 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 min-w-0 text-base font-bold text-white" {...fieldAttrs(`trending-services.${slot.slotId}`, 'title')}>
              <EditableText editor={editor} path={['trending', 'slots', slotIndex, 'title']} label="Название трендовой карточки" value={title} multiline>
                {title}
              </EditableText>
            </h3>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-amber-300 transition group-hover:translate-x-1" />
          </div>
          <p className="line-clamp-2 text-sm leading-5 text-slate-400" {...fieldAttrs(`trending-services.${slot.slotId}`, 'description')}>
            <EditableText editor={editor} path={['trending', 'slots', slotIndex, 'description']} label="Описание трендовой карточки" value={description} multiline>
              {description}
            </EditableText>
          </p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-amber-300">{price ? `от ${price} токенов` : 'быстрый старт'}</span>
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
    <section className="border-b border-slate-800 bg-slate-950" {...sectionAttrs(chat.sectionKey)}>
      <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,0.84fr)_minmax(420px,1fr)] lg:items-center lg:px-8 lg:py-16 xl:gap-12">
        <div className="max-w-xl">
          <SectionEyebrow icon={<Bot className="h-4 w-4" />} text={chat.eyebrow} section={chat.sectionKey} editor={editor} path={['chat', 'eyebrow']} label="Бейдж блока чата" />
          <h2 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl xl:text-5xl" {...fieldAttrs(chat.sectionKey, 'title')}>
            <EditableText editor={editor} path={['chat', 'title']} label="Заголовок блока чата" value={chat.title} multiline>
              {chat.title}
            </EditableText>
          </h2>
          <p className="mt-4 text-base leading-7 text-slate-400" {...fieldAttrs(chat.sectionKey, 'lead')}>
            <EditableText editor={editor} path={['chat', 'lead']} label="Описание блока чата" value={chat.lead} multiline>
              {chat.lead}
            </EditableText>
          </p>
          <div className="mt-6 grid gap-2.5">
            {chat.prompts.map((prompt, index) => (
              <div key={`${prompt}-${index}`} className="flex items-start gap-3 rounded-md border border-slate-800 bg-slate-900 p-3.5" {...fieldAttrs(chat.sectionKey, `prompt-${index}`)}>
                <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                <span className="text-sm leading-6 text-slate-200">
                  <EditableText editor={editor} path={['chat', 'prompts', index]} label="Пример запроса" value={prompt} multiline>
                    {prompt}
                  </EditableText>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-3 shadow-2xl shadow-black/20 sm:p-4">
          <div className="rounded-md border border-slate-800 bg-slate-950">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Sparkles className="h-4 w-4 text-violet-300" />
                Allvision AI
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-slate-900 px-2.5 py-1">Фото</span>
                <span className="rounded-full bg-slate-900 px-2.5 py-1">Видео</span>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-200">Звук</span>
              </div>
            </div>
            <div className="space-y-3 p-3 sm:p-4">
              <ChatMockRow label="Промпт" value={chat.mock.prompt} editor={editor} path={['chat', 'mock', 'prompt']} />
              <div className="grid gap-3 sm:grid-cols-3">
                <ChatMockControl icon={<Wand2 className="h-4 w-4" />} label="Модель" value="Veo / Kling / Sora" />
                <ChatMockControl icon={<Film className="h-4 w-4" />} label="Формат" value="9:16" />
                <ChatMockControl icon={<Library className="h-4 w-4" />} label="Референс" value="опционально" />
              </div>
              <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                <div className="aspect-[16/7] bg-slate-950">
                  <EditableMedia editor={editor} path={['chat', 'mock', 'media']} label="Медиа примера чата" media={chat.mock.media}>
                    <MediaBlock media={chat.mock.media} />
                  </EditableMedia>
                </div>
                <div className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      <EditableText editor={editor} path={['chat', 'mock', 'resultTitle']} label="Заголовок результата в мокапе" value={chat.mock.resultTitle}>
                        {chat.mock.resultTitle}
                      </EditableText>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      <EditableText editor={editor} path={['chat', 'mock', 'resultDescription']} label="Описание результата в мокапе" value={chat.mock.resultDescription} multiline>
                        {chat.mock.resultDescription}
                      </EditableText>
                    </div>
                  </div>
                  <Button asChild size="sm" className="bg-violet-600 hover:bg-violet-500">
                    <Link href={actionHref('/ai', isAuthed)}>Открыть чат</Link>
                  </Button>
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
    <section className="border-b border-slate-800 bg-slate-900/40" {...sectionAttrs(models.sectionKey)}>
      <div className="mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="max-w-2xl">
            <SectionEyebrow icon={<Layers3 className="h-4 w-4" />} text={models.eyebrow} section={models.sectionKey} editor={editor} path={['models', 'eyebrow']} label="Бейдж блока моделей" />
            <h2 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl lg:text-5xl" {...fieldAttrs(models.sectionKey, 'title')}>
              <EditableText editor={editor} path={['models', 'title']} label="Заголовок блока моделей" value={models.title} multiline>
                {models.title}
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
              <article key={family.key} className={cn('rounded-lg border p-4', modelAccentClasses[family.accent])} {...sectionAttrs(`${models.sectionKey}.${family.key}`)}>
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
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

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
  const featured = services
    .filter((service) => ['revive-old-photo', 'face-in-trend', 'kid-cartoon-hero', 'anniversary-card', 'photo-restore', 'photo-animate'].includes(service.slug))
    .slice(0, 6);

  return (
    <section className="border-b border-slate-800 bg-slate-950" {...sectionAttrs(readyServices.sectionKey)}>
      <div className="mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <SectionEyebrow icon={<Zap className="h-4 w-4" />} text={readyServices.eyebrow} section={readyServices.sectionKey} editor={editor} path={['readyServices', 'eyebrow']} label="Бейдж блока услуг" />
            <h2 className="mt-4 text-3xl font-black tracking-normal text-white sm:text-4xl" {...fieldAttrs(readyServices.sectionKey, 'title')}>
              <EditableText editor={editor} path={['readyServices', 'title']} label="Заголовок блока услуг" value={readyServices.title} multiline>
                {readyServices.title}
              </EditableText>
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400" {...fieldAttrs(readyServices.sectionKey, 'lead')}>
              <EditableText editor={editor} path={['readyServices', 'lead']} label="Описание блока услуг" value={readyServices.lead} multiline>
                {readyServices.lead}
              </EditableText>
            </p>
          </div>
          <Button asChild variant="outline" className="border-slate-700 bg-slate-900">
            <Link href="/services">
              <EditableText editor={editor} path={['readyServices', 'cta']} label="Текст кнопки услуг" value={readyServices.cta}>
                {readyServices.cta}
              </EditableText>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-72 rounded-lg bg-slate-900" />)}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featured.map((service) => (
              <ServiceShowcaseCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ServiceShowcaseCard({ service }: { service: PublicService }) {
  const media = serviceMedia(service) ?? {
    type: 'image' as const,
    url: '/mock_preview.png',
    alt: service.title,
  };

  return (
    <Link href={`/services/${service.slug}`} className="group block min-w-0">
      <article className="h-full overflow-hidden rounded-lg border border-slate-800 bg-slate-900 transition duration-300 hover:-translate-y-1 hover:border-amber-300/60">
        <div className="aspect-[16/10] overflow-hidden bg-slate-950">
          <MediaBlock media={media} className="transition duration-500 group-hover:scale-105" />
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-lg font-bold text-white">{service.title}</h3>
            <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-amber-300 transition group-hover:translate-x-1" />
          </div>
          <p className="line-clamp-2 text-sm leading-6 text-slate-400">{service.shortDesc}</p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-amber-300">от {giftServicePriceFrom(service)} токенов</span>
            <span className="text-slate-500">готовый flow</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

function BenefitsPricingSection({
  content,
  editor,
  isAuthed,
  starterPackage,
}: {
  content: HomeLandingContent;
  editor?: HomeEditorController;
  isAuthed: boolean;
  starterPackage?: { tokens: number; bonus: number; priceRub: number } | null;
}) {
  const benefits = content.benefits;
  const photoPrice = estimateChatGenerationCostCoins('nano-banana');
  const videoPrice = estimateChatGenerationCostCoins('veo-3.1-fast', { duration: 8 });
  const audioPrice = estimateChatGenerationCostCoins('veo-3.1-fast', { duration: 8, generateAudio: true });

  return (
    <section className="border-b border-slate-800 bg-slate-900/40" {...sectionAttrs(benefits.sectionKey)}>
      <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8 lg:py-20">
        <div>
          <SectionEyebrow icon={<CheckCircle2 className="h-4 w-4" />} text={benefits.eyebrow} section={benefits.sectionKey} editor={editor} path={['benefits', 'eyebrow']} label="Бейдж блока преимуществ" />
          <h2 className="mt-4 max-w-3xl text-3xl font-black tracking-normal text-white sm:text-4xl lg:text-5xl" {...fieldAttrs(benefits.sectionKey, 'title')}>
            <EditableText editor={editor} path={['benefits', 'title']} label="Заголовок блока преимуществ" value={benefits.title} multiline>
              {benefits.title}
            </EditableText>
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400 sm:text-lg" {...fieldAttrs(benefits.sectionKey, 'lead')}>
            <EditableText editor={editor} path={['benefits', 'lead']} label="Описание блока преимуществ" value={benefits.lead} multiline>
              {benefits.lead}
            </EditableText>
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {benefits.items.map((item, index) => (
              <article key={item.key} className="rounded-lg border border-slate-800 bg-slate-950 p-5" {...sectionAttrs(`${benefits.sectionKey}.${item.key}`)}>
                <h3 className="font-bold text-white" {...fieldAttrs(`${benefits.sectionKey}.${item.key}`, 'title')}>
                  <EditableText editor={editor} path={['benefits', 'items', index, 'title']} label="Название преимущества" value={item.title}>
                    {item.title}
                  </EditableText>
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-400" {...fieldAttrs(`${benefits.sectionKey}.${item.key}`, 'description')}>
                  <EditableText editor={editor} path={['benefits', 'items', index, 'description']} label="Описание преимущества" value={item.description} multiline>
                    {item.description}
                  </EditableText>
                </p>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-lg border border-amber-300/30 bg-slate-950 p-5 shadow-2xl shadow-black/20" {...sectionAttrs('pricing-card')}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-amber-300">Стоимость</div>
              <h3 className="mt-1 text-2xl font-black text-white">Низкие цены без подписки</h3>
            </div>
            <TokenIcon className="h-9 w-9 text-amber-300" />
          </div>
          <div className="mt-6 space-y-3">
            <PriceRow label="Фото / образ" value={`от ${formatCoins(photoPrice)}`} icon={<ImageIcon className="h-4 w-4" />} />
            <PriceRow label="Видео по промпту" value={`от ${formatCoins(videoPrice)}`} icon={<Film className="h-4 w-4" />} />
            <PriceRow label="Видео со звуком" value={`от ${formatCoins(audioPrice)}`} icon={<Volume2 className="h-4 w-4" />} />
          </div>
          <div className="mt-5 rounded-md border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm font-semibold text-white">
              {starterPackage ? `${starterPackage.tokens + starterPackage.bonus} токенов за ${starterPackage.priceRub} ₽` : 'Пакеты токенов'}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Пополняйте баланс тогда, когда нужно. Цена конкретного запуска видна до списания.
            </p>
          </div>
          <Button asChild className="mt-5 h-11 w-full bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href={isAuthed ? '/profile?tab=billing' : '/pricing'}>
              {isAuthed ? 'Пополнить баланс' : 'Смотреть цены'}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </aside>
      </div>
    </section>
  );
}

function FinalCta({ content, editor, isAuthed }: { content: HomeLandingContent; editor?: HomeEditorController; isAuthed: boolean }) {
  const finalCta = content.finalCta;

  return (
    <section className="bg-slate-950" {...sectionAttrs(finalCta.sectionKey)}>
      <div className="mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-white sm:text-3xl" {...fieldAttrs(finalCta.sectionKey, 'title')}>
                <EditableText editor={editor} path={['finalCta', 'title']} label="Заголовок финального CTA" value={finalCta.title} multiline>
                  {finalCta.title}
                </EditableText>
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base" {...fieldAttrs(finalCta.sectionKey, 'lead')}>
                <EditableText editor={editor} path={['finalCta', 'lead']} label="Описание финального CTA" value={finalCta.lead} multiline>
                  {finalCta.lead}
                </EditableText>
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-11 bg-violet-600 hover:bg-violet-500">
                <Link href={actionHref('/ai', isAuthed)}>
                  <Sparkles className="h-4 w-4" />
                  Allvision AI
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 border-slate-700 bg-slate-950">
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
    return <video src={src} className={cn('h-full w-full object-cover', className)} autoPlay loop muted playsInline />;
  }

  return <img src={src} alt={media.alt} className={cn('h-full w-full object-cover', className)} />;
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
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200" {...fieldAttrs(section, 'eyebrow')}>
      <span className="text-amber-300">{icon}</span>
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
    <div className="rounded-md border border-slate-800 bg-slate-900 p-3">
      <div className="text-xs font-medium uppercase text-slate-500">{label}</div>
      <div className="mt-2 text-sm leading-6 text-slate-200">
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

function ChatMockControl({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="text-violet-300">{icon}</span>
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function PriceRow({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-slate-800 bg-slate-900 p-3">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <span className="text-amber-300">{icon}</span>
        {label}
      </div>
      <div className="text-sm font-bold text-white">{value}</div>
    </div>
  );
}
