'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Volume2, VolumeX } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

/** Протяжка меньше этого — не листание, а дрожание руки или обычный клик. */
const SWIPE_THRESHOLD_PX = 70;
/** Дальше этого лента не оттягивается: резинка должна чувствоваться, но не уезжать. */
const MAX_DRAG_PX = 260;

/**
 * Слайдер готовых шаблонов.
 *
 * Лента слушается пальца и мыши: во время протяжки слайды едут за курсором, на отпускании
 * либо переключаются, либо возвращаются на место. Стрелок нет намеренно — соседние слайды
 * видны по краям и кликабельны, а этого достаточно, чтобы понять, что лента продолжается.
 *
 * Видео идёт без звука: десяток роликов, заигравших разом при заходе на страницу, — худшее,
 * что может случиться с главной. Звук включается кнопкой на активном слайде.
 */
export function TemplateSlider({ services }: { services: PublicService[] }) {
  const [index, setIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; pointerId: number | null } | null>(null);

  const total = services.length;
  const go = useCallback(
    (next: number) => {
      if (total === 0) return;
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  useEffect(() => {
    setIndex(0);
  }, [total]);

  if (total === 0) return null;

  const active = services[index];
  const prev = services[(index - 1 + total) % total];
  const next = services[(index + 1) % total];

  const beginDrag = (clientX: number, pointerId: number | null) => {
    dragRef.current = { startX: clientX, pointerId };
    setDragging(true);
  };

  const moveDrag = (clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = clientX - drag.startX;
    // Резинка: у краёв тянется тяжелее, чем в середине.
    setDragX(Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, delta)));
  };

  const endDrag = (clientX: number) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    setDragX(0);
    if (!drag) return;
    const delta = clientX - drag.startX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    go(delta < 0 ? index + 1 : index - 1);
  };

  /** Клик по соседнему слайду листает — но только если это был именно клик, а не протяжка. */
  const clickSide = (direction: -1 | 1) => {
    if (Math.abs(dragX) > 4) return;
    go(index + direction);
  };

  return (
    <div className="relative select-none">
      {/* Светящаяся дуга позади ленты: статичная, без пересчётов на скролле. */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-64 max-w-3xl rounded-[100%] bg-amber-400/10 blur-[90px]" />

      <div
        className="relative flex touch-pan-y items-center justify-center gap-3"
        style={{
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          beginDrag(event.clientX, event.pointerId);
        }}
        onPointerMove={(event) => moveDrag(event.clientX)}
        onPointerUp={(event) => endDrag(event.clientX)}
        onPointerCancel={() => {
          dragRef.current = null;
          setDragging(false);
          setDragX(0);
        }}
      >
        <SideSlide service={prev} side="left" onClick={() => clickSide(-1)} />

        <div className="relative w-full max-w-[520px] shrink-0">
          <div
            className={cn(
              'group relative overflow-hidden rounded-2xl border border-amber-300/30 bg-slate-950',
              'shadow-[0_0_60px_-12px_rgba(251,191,36,0.35)] transition duration-500',
              !dragging && 'hover:shadow-[0_0_80px_-10px_rgba(251,191,36,0.5)]',
            )}
          >
            <div className="relative aspect-[4/5] sm:aspect-[16/11]">
              <SlideMedia service={active} muted={!soundOn} playing />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />

              <button
                type="button"
                onClick={() => setSoundOn((value) => !value)}
                aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
                className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-slate-950/70 text-slate-100 backdrop-blur transition hover:bg-slate-900"
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>

              <div className="absolute inset-x-0 bottom-0 p-4">
                <h3 className="text-lg font-bold text-white drop-shadow sm:text-xl">{active.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{active.shortDesc}</p>
                <Link
                  href={`/services/${active.slug}`}
                  // Ссылку открываем только по настоящему клику: иначе свайп, начатый
                  // с карточки, уводил бы со страницы.
                  onClick={(event) => {
                    if (Math.abs(dragX) > 4) event.preventDefault();
                  }}
                  draggable={false}
                  className="mt-3 inline-flex h-8 items-center rounded-full bg-amber-400 px-4 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
                >
                  Выбрать этот шаблон
                </Link>
              </div>
            </div>
          </div>
        </div>

        <SideSlide service={next} side="right" onClick={() => clickSide(1)} />
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {services.map((service, dotIndex) => (
          <button
            key={service.id}
            type="button"
            onClick={() => go(dotIndex)}
            aria-label={`Шаблон ${dotIndex + 1}`}
            className={cn(
              'h-1.5 rounded-full transition-all',
              dotIndex === index ? 'w-6 bg-amber-400' : 'w-1.5 bg-slate-600 hover:bg-slate-500',
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Боковой слайд: уменьшенный, растворяется к краю и листает лента по клику. */
function SideSlide({ service, side, onClick }: { service: PublicService; side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Предыдущий шаблон' : 'Следующий шаблон'}
      className="relative hidden h-[220px] w-[180px] shrink-0 overflow-hidden rounded-xl border border-white/10 opacity-45 transition hover:opacity-70 lg:block"
    >
      <SlideMedia service={service} muted playing={false} />
      <div
        className={cn(
          'absolute inset-0',
          side === 'left'
            ? 'bg-gradient-to-r from-slate-950 via-slate-950/40 to-transparent'
            : 'bg-gradient-to-l from-slate-950 via-slate-950/40 to-transparent',
        )}
      />
    </button>
  );
}

function SlideMedia({ service, muted, playing }: { service: PublicService; muted: boolean; playing: boolean }) {
  const video = service.previewMode === 'image' ? null : mediaUrl(service.previewVideo);
  const cover = mediaUrl(service.previewImage ?? service.coverImage);

  if (video) {
    return (
      <video
        key={`${service.id}-${muted ? 'muted' : 'sound'}`}
        src={video}
        autoPlay={playing}
        muted={muted}
        loop
        playsInline
        draggable={false}
        // Боковые слайды не грузим целиком: на главной их два, и трафик ни к чему.
        preload={playing ? 'auto' : 'metadata'}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  if (!cover) return <span className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cover}
      alt={service.title}
      draggable={false}
      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />
  );
}
