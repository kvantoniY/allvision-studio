'use client';

import Link from 'next/link';
import { ArrowRight, ImagePlus, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditableText, type HomeEditorController } from '@/components/pages/HomePageInlineEditor';
import { Reveal } from '@/components/home/Reveal';
import { TemplateSlider } from '@/components/home/TemplateSlider';
import { useListServicesQuery } from '@/store/api/services-api';
import type { HomeLandingContent } from '@/lib/home-landing-content';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

/**
 * Первый экран: видео-поздравления.
 *
 * Главный продукт открывает страницу и ведёт ровно в два места: взять готовый шаблон или
 * собрать ролик самому. Готовые шаблоны показываются лентой, а не списком: поздравление
 * выбирают глазами, и один кадр из ролика объясняет больше абзаца текста.
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
  const { data } = useListServicesQuery({ section: 'greetings' });
  const templates = data?.services ?? [];

  return (
    <section
      className="relative isolate overflow-hidden"
      data-home-section={block.sectionKey}
    >
      {/*
       * Фон первого экрана растворяется книзу, а не обрывается по краю секции.
       * Без этого низ экрана читался как приклеенная полоса фотографии: под ней
       * начинался общий звёздный фон, и стык был виден линейкой. Маска — один
       * градиент на том же элементе, дополнительных слоёв не нужно.
       */}
      {block.media.type === 'video' ? (
        <video
          src={background}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_bottom,#000_45%,transparent_92%)]"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={background}
          alt={block.media.alt}
          className="absolute inset-0 h-full w-full object-cover opacity-25 [mask-image:linear-gradient(to_bottom,#000_45%,transparent_92%)]"
        />
      )}

      {/*
       * Затемнение поверх фонового ролика. Пятна света сюда больше не рисуем: они
       * живут одним слоем на всю страницу (AmbientBackground), и дублировать их
       * здесь значило бы платить размытием дважды за одну и ту же картинку.
       */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/35 to-transparent" />

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

      <div className="relative mx-auto w-full max-w-[1480px] px-4 py-12 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        {templates.length > 0 && (
          <Reveal delayMs={100}>
            {/*
             * Подпись над лентой — светящаяся строка, а не заголовок: главное здесь
             * сами ролики, и крупный текст отбирал бы у них внимание.
             */}
            <div className="mb-5 flex justify-center">
              <span className="av-pill inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-100 sm:text-sm">
                <Sparkles className="h-3.5 w-3.5 text-amber-300 drop-shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                Готовые видео-поздравления
              </span>
            </div>
            <TemplateSlider services={templates} />

            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="av-btn-gradient av-pulse group h-12 px-7 text-base font-bold">
                <Link href="/services?tab=greetings">
                  Перейти ко всем шаблонам
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="av-btn-glass h-12 px-7 text-base font-semibold text-white hover:text-white"
              >
                <Link href="/editor">
                  <Sparkles className="h-4 w-4" />
                  Создать с нуля в редакторе
                </Link>
              </Button>
            </div>
          </Reveal>
        )}

        {/* Три шага: человеку важно понять объём работы до того, как он нажмёт кнопку. */}
        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {block.steps.map((step, index) => (
            <Reveal key={step.key} delayMs={index * 90}>
              <div className="av-card av-card-hover av-card-quiet group h-full rounded-2xl p-5">
                {/* Номер шага — светящийся кружок: взгляд сразу считывает порядок. */}
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-violet-300/50 bg-violet-500/20 text-sm font-black text-violet-100 shadow-[0_0_18px_-4px_rgba(139,92,246,0.9)]">
                  {index + 1}
                </span>
                <h3 className="mt-3 text-sm font-bold text-white">
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

        {/* Редактор показываем интерфейсом: это убедительнее, чем обещать простоту словами. */}
        <Reveal delayMs={120} className="mt-8">
          <div className="av-card av-card-violet av-glow-violet grid gap-0 overflow-hidden rounded-3xl lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="flex flex-col justify-center gap-3 p-6 lg:p-8">
              <h3 className="text-xl font-black text-white sm:text-2xl lg:text-3xl">
                <EditableText editor={editor} path={['greetings', 'editorTitle']} label="Заголовок карточки редактора" value={block.editorTitle}>
                  {block.editorTitle}
                </EditableText>
              </h3>
              <p className="text-sm leading-6 text-slate-400">
                <EditableText editor={editor} path={['greetings', 'editorLead']} label="Описание редактора" value={block.editorLead} multiline>
                  {block.editorLead}
                </EditableText>
              </p>
              <Link
                href="/editor"
                className="group inline-flex w-fit items-center gap-2 rounded-full border border-violet-300/40 bg-violet-500/10 px-4 py-2 text-sm font-bold text-violet-100 transition hover:border-violet-200/70 hover:bg-violet-500/20 hover:shadow-[0_0_26px_-8px_rgba(139,92,246,0.95)]"
              >
                <Play className="h-4 w-4 fill-violet-200 text-violet-200" />
                Открыть редактор
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>

            <div className="relative min-h-[220px]">
              {block.editorMedia.type === 'video' ? (
                <video src={editorShot} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editorShot} alt={block.editorMedia.alt} className="absolute inset-0 h-full w-full object-cover" />
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
          </div>
        </Reveal>
      </div>
    </section>
  );
}
