'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Volume2, VolumeX } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

/** Порог, после которого протяжка считается листанием, а не случайным дрожанием руки. */
const SWIPE_THRESHOLD_PX = 60;

/**
 * Слайдер готовых шаблонов.
 *
 * Соседние слайды видны по краям и притушены — так понятно, что лента продолжается, и
 * ничего не нужно объяснять словами. Листается пальцем на телефоне и протяжкой мыши на
 * десктопе; стрелки есть, но намеренно бледные — это подсказка, а не главный способ.
 *
 * Видео на слайде идёт без звука: десяток роликов, заигравших разом при заходе на
 * страницу, — худшее, что может случиться с главной. Звук включается кнопкой.
 */
export function TemplateSlider({ services }: { services: PublicService[] }) {
  const [index, setIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);

  const total = services.length;
  const go = useCallback(
    (next: number) => {
      if (total === 0) return;
      setIndex(((next % total) + total) % total);
    },
    [total],
  );

  // Стрелки клавиатуры листают ленту, когда она в фокусе: обычное ожидание от карусели.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') go(index - 1);
    if (event.key === 'ArrowRight') go(index + 1);
  };

  useEffect(() => {
    setIndex(0);
  }, [total]);

  if (total === 0) return null;

  const active = services[index];
  const prev = services[(index - 1 + total) % total];
  const next = services[(index + 1) % total];

  const beginDrag = (clientX: number) => {
    dragRef.current = { startX: clientX, moved: false };
  };
  const endDrag = (clientX: number) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const delta = clientX - drag.startX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    go(delta < 0 ? index + 1 : index - 1);
  };

  return (
    <div
      className="relative select-none"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => beginDrag(event.clientX)}
      onPointerUp={(event) => endDrag(event.clientX)}
      onPointerCancel={() => { dragRef.current = null; }}
      onTouchStart={(event) => beginDrag(event.touches[0].clientX)}
      onTouchEnd={(event) => endDrag(event.changedTouches[0].clientX)}
    >
      {/* Светящаяся дуга позади ленты: статичная, без пересчётов на скролле. */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-64 max-w-3xl rounded-[100%] bg-amber-400/10 blur-[90px]" />

      <div className="relative flex items-center justify-center gap-3">
        {/* Соседние слайды видны краем и притушены — лента явно продолжается. */}
        <SideSlide service={prev} side="left" onClick={() => go(index - 1)} />

        <div className="relative w-full max-w-[520px] shrink-0">
          <div className="group relative overflow-hidden rounded-2xl border border-amber-300/30 bg-slate-950 shadow-[0_0_60px_-12px_rgba(251,191,36,0.35)] transition duration-500 hover:shadow-[0_0_80px_-10px_rgba(251,191,36,0.5)]">
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
                  className="mt-3 inline-flex h-8 items-center rounded-full bg-amber-400 px-4 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
                >
                  Выбрать этот шаблон
                </Link>
              </div>
            </div>
          </div>
        </div>

        <SideSlide service={next} side="right" onClick={() => go(index + 1)} />
      </div>

      {/* Стрелки бледные намеренно: основной способ — свайп, они лишь подсказка. */}
      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Предыдущий шаблон"
        className="absolute left-1 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-slate-950/40 text-white/50 backdrop-blur transition hover:bg-slate-950/70 hover:text-white sm:grid"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Следующий шаблон"
        className="absolute right-1 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-slate-950/40 text-white/50 backdrop-blur transition hover:bg-slate-950/70 hover:text-white sm:grid"
      >
        <ChevronRight className="h-5 w-5" />
      </button>

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

/** Боковой слайд: уменьшенный и растворяющийся к краю. */
function SideSlide({ service, side, onClick }: { service: PublicService; side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-hidden="true"
      tabIndex={-1}
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
        // Боковые слайды не грузим целиком: на главной их два, и трафик ни к чему.
        preload={playing ? 'auto' : 'metadata'}
        className="absolute inset-0 h-full w-full object-cover"
      />
    );
  }
  if (!cover) return <span className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cover} alt={service.title} className="absolute inset-0 h-full w-full object-cover" />
  );
}
