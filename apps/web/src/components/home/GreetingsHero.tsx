'use client';

import Link from 'next/link';
import { ArrowRight, Clapperboard, ImagePlus, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditableText, type HomeEditorController } from '@/components/pages/HomePageInlineEditor';
import { Reveal } from '@/components/home/Reveal';
import type { HomeLandingContent } from '@/lib/home-landing-content';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

/**
 * Первый экран: видео-поздравления.
 *
 * Главный продукт открывает страницу и ведёт ровно в два места: выбрать готовый сценарий
 * или собрать ролик самому. Третьей кнопки здесь нет намеренно — выбор из двух понятных
 * путей человек делает сразу, выбор из пяти откладывает.
 *
 * Фон затемнён и размыт по краям, а не залит сплошным: кадр из поздравления работает
 * лучше любого описания, но текст поверх него должен читаться при любой картинке.
 */
export function GreetingsHero({
  content,
  editor,
}: {
  content: HomeLandingContent;
  editor?: HomeEditorController;
}) {
  const block = content.greetings;
  const background = mediaUrl(block.media.url) ?? block.media.url;
  const editorShot = mediaUrl(block.editorMedia.url) ?? block.editorMedia.url;

  return (
    <section
      className="relative isolate overflow-hidden border-b border-slate-800 bg-slate-950"
      data-home-section={block.sectionKey}
    >
      {block.media.type === 'video' ? (
        <video
          src={background}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={background} alt={block.media.alt} className="absolute inset-0 h-full w-full object-cover opacity-40" />
      )}

      {/* Градиентные пятна нарисованы статикой: никаких пересчётов на скролле, только blur. */}
      <div className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-violet-600/25 blur-[120px]" />
      <div className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-amber-500/20 blur-[130px]" />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/85 via-slate-950/75 to-slate-950" />

      {editor?.enabled && (
        <button
          type="button"
          onClick={() =>
            editor.openMediaEditor({ path: ['greetings', 'media'], label: 'Фон первого экрана', media: block.media })
          }
          className="absolute left-4 top-4 z-30 inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-amber-100 backdrop-blur transition hover:bg-amber-400 hover:text-slate-950 sm:left-6 lg:left-8"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Фон
        </button>
      )}

      <div className="relative mx-auto w-full max-w-[1480px] px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.85fr)] lg:items-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full border border-violet-400/40 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-200"
              data-home-section={block.sectionKey}
              data-home-field="eyebrow"
            >
              <Clapperboard className="h-3.5 w-3.5" />
              <EditableText editor={editor} path={['greetings', 'eyebrow']} label="Надзаголовок" value={block.eyebrow}>
                {block.eyebrow}
              </EditableText>
            </span>

            <h1
              className="mt-5 max-w-3xl text-4xl font-black leading-[1.02] tracking-tight text-white sm:text-5xl xl:text-6xl"
              data-home-section={block.sectionKey}
              data-home-field="title"
            >
              <EditableText editor={editor} path={['greetings', 'title']} label="Заголовок" value={block.title} multiline>
                {block.title}
              </EditableText>
            </h1>

            <p
              className="mt-5 max-w-xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8"
              data-home-section={block.sectionKey}
              data-home-field="lead"
            >
              <EditableText editor={editor} path={['greetings', 'lead']} label="Описание" value={block.lead} multiline>
                {block.lead}
              </EditableText>
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="group h-12 bg-amber-400 px-6 text-slate-950 hover:bg-amber-300">
                <Link href="/services?tab=greetings">
                  <Sparkles className="h-4 w-4" />
                  <EditableText editor={editor} path={['greetings', 'primaryCta']} label="Основная кнопка" value={block.primaryCta}>
                    {block.primaryCta}
                  </EditableText>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/20 bg-white/10 px-6 text-white hover:bg-white/20 hover:text-white"
              >
                <Link href="/editor">
                  <EditableText editor={editor} path={['greetings', 'secondaryCta']} label="Вторая кнопка" value={block.secondaryCta}>
                    {block.secondaryCta}
                  </EditableText>
                </Link>
              </Button>
            </div>

            <div className="mt-8 grid max-w-lg grid-cols-3 gap-2.5">
              {block.stats.map((item, index) => (
                <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 p-3 backdrop-blur">
                  <div className="text-lg font-bold text-white">
                    <EditableText editor={editor} path={['greetings', 'stats', index, 'value']} label="Значение" value={item.value}>
                      {item.value}
                    </EditableText>
                  </div>
                  <div className="mt-0.5 text-[11px] leading-4 text-slate-400">
                    <EditableText editor={editor} path={['greetings', 'stats', index, 'label']} label="Подпись" value={item.label}>
                      {item.label}
                    </EditableText>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Скриншот редактора — главный аргумент «соберу сам»: показать интерфейс убедительнее,
              чем обещать простоту словами. */}
          <Reveal delayMs={120} className="relative">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/50 backdrop-blur">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                <span className="ml-2 text-[11px] text-slate-400">Редактор ролика</span>
              </div>

              <div className="relative aspect-[16/10]">
                {block.editorMedia.type === 'video' ? (
                  <video src={editorShot} autoPlay muted loop playsInline className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={editorShot} alt={block.editorMedia.alt} className="h-full w-full object-cover" />
                )}
                {editor?.enabled && (
                  <button
                    type="button"
                    onClick={() =>
                      editor.openMediaEditor({
                        path: ['greetings', 'editorMedia'],
                        label: 'Скриншот редактора',
                        media: block.editorMedia,
                      })
                    }
                    className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-amber-300/50 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-amber-100 backdrop-blur transition hover:bg-amber-400 hover:text-slate-950"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    Скриншот
                  </button>
                )}
              </div>

              <div className="border-t border-white/10 p-4">
                <h2 className="text-sm font-semibold text-white">
                  <EditableText editor={editor} path={['greetings', 'editorTitle']} label="Заголовок карточки редактора" value={block.editorTitle}>
                    {block.editorTitle}
                  </EditableText>
                </h2>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  <EditableText editor={editor} path={['greetings', 'editorLead']} label="Описание редактора" value={block.editorLead} multiline>
                    {block.editorLead}
                  </EditableText>
                </p>
                <Link
                  href="/editor"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-300 transition hover:text-violet-200"
                >
                  <Play className="h-3.5 w-3.5" />
                  Открыть редактор
                </Link>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Три шага: человеку важно понять объём работы до того, как он нажмёт кнопку. */}
        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {block.steps.map((step, index) => (
            <Reveal key={step.key} delayMs={index * 90}>
              <div className="group h-full rounded-xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur transition hover:border-violet-400/40 hover:bg-white/[0.07]">
                <span
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold',
                    'bg-violet-500/20 text-violet-200',
                  )}
                >
                  {index + 1}
                </span>
                <h3 className="mt-3 text-sm font-semibold text-white">
                  <EditableText editor={editor} path={['greetings', 'steps', index, 'title']} label="Шаг" value={step.title}>
                    {step.title}
                  </EditableText>
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-slate-400">
                  <EditableText
                    editor={editor}
                    path={['greetings', 'steps', index, 'description']}
                    label="Описание шага"
                    value={step.description}
                    multiline
                  >
                    {step.description}
                  </EditableText>
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
