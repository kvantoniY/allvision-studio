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

/** Доля ширины, после которой отпускание листает, а не возвращает слайд на место. */
const COMMIT_RATIO = 0.22;
/** Длительность доводки после отпускания — столько же живёт CSS-переход. */
const SETTLE_MS = 300;

/**
 * Слайдер готовых шаблонов.
 *
 * Листание сделано перекрёстным затуханием, привязанным к пальцу: чем дальше протянули,
 * тем сильнее проявляется соседний слайд и тем прозрачнее становится текущий. Раньше лента
 * просто сдвигалась целиком на несколько десятков пикселей — жест был, а ощущения листания
 * не возникало: ничего не появлялось и не исчезало.
 *
 * Отпускание либо доводит начатое до конца, либо возвращает слайд на место — решает
 * пройденная доля ширины, а не абсолютные пиксели: на телефоне и на широком мониторе
 * «половина экрана» должна значить одно и то же.
 *
 * Стрелок нет намеренно: соседние слайды видны по краям и кликабельны, этого достаточно,
 * чтобы понять, что лента продолжается.
 */
export function TemplateSlider({ services }: { services: PublicService[] }) {
  const [index, setIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  /** −1 — тянем влево (проявляется следующий), +1 — вправо (предыдущий). */
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'drag' | 'settle'>('idle');
  const dragRef = useRef<{ startX: number } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = services.length;

  useEffect(() => {
    setIndex(0);
  }, [total]);

  useEffect(() => () => {
    if (settleRef.current) clearTimeout(settleRef.current);
  }, []);

  /**
   * Доводка: сначала докручиваем затухание до конца, и только потом меняем активный слайд.
   *
   * Если поменять индекс сразу, новый слайд появится с полной непрозрачностью — вместо
   * плавного проявления получится скачок.
   */
  const settle = useCallback(
    (direction: -1 | 0 | 1) => {
      if (settleRef.current) clearTimeout(settleRef.current);
      setPhase('settle');
      setProgress(direction === 0 ? 0 : direction > 0 ? -1 : 1);
      settleRef.current = setTimeout(() => {
        if (direction !== 0) setIndex((current) => ((current + direction) % total + total) % total);
        setProgress(0);
        setPhase('idle');
      }, SETTLE_MS);
    },
    [total],
  );

  if (total === 0) return null;

  const active = services[index];
  const prev = services[(index - 1 + total) % total];
  const next = services[(index + 1) % total];

  const shift = Math.abs(progress);
  // Кто проявляется: тянем влево — следующий, вправо — предыдущий.
  const incoming = progress < 0 ? next : prev;
  const showIncoming = shift > 0.002 && total > 1;

  const beginDrag = (clientX: number) => {
    if (settleRef.current) clearTimeout(settleRef.current);
    dragRef.current = { startX: clientX };
    setPhase('drag');
  };

  const moveDrag = (clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const width = boxRef.current?.clientWidth ?? 1;
    const delta = (clientX - drag.startX) / Math.max(1, width);
    setProgress(Math.max(-1, Math.min(1, delta)));
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (Math.abs(progress) < COMMIT_RATIO || total < 2) {
      settle(0);
      return;
    }
    settle(progress < 0 ? 1 : -1);
  };

  /** Клик по соседнему слайду листает — но только если это был именно клик, а не протяжка. */
  const clickSide = (direction: -1 | 1) => {
    if (Math.abs(progress) > 0.01) return;
    settle(direction);
  };

  const animate = phase !== 'drag';
  const transition = animate ? `opacity ${SETTLE_MS}ms ease-out, transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none';

  return (
    <div className="relative select-none">
      {/* Светящаяся дуга позади ленты: статичная, без пересчётов на скролле. */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-64 max-w-3xl rounded-[100%] bg-amber-400/10 blur-[90px]" />

      <div
        className="relative flex touch-pan-y items-center justify-center gap-3"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          beginDrag(event.clientX);
        }}
        onPointerMove={(event) => moveDrag(event.clientX)}
        onPointerUp={endDrag}
        onPointerCancel={() => {
          dragRef.current = null;
          settle(0);
        }}
      >
        <SideSlide
          service={prev}
          side="left"
          onClick={() => clickSide(-1)}
          // Слайд, который вот-вот встанет в центр, по дороге растворяется.
          fade={progress > 0 ? shift : 0}
        />

        <div ref={boxRef} className="relative w-full max-w-[520px] shrink-0">
          <div className="relative aspect-[4/5] sm:aspect-[16/11]">
            {showIncoming && (
              <SlideCard
                key={`incoming-${incoming.id}`}
                service={incoming}
                muted
                dragging={phase === 'drag'}
                style={{
                  opacity: shift,
                  transform: `translateX(${(1 - shift) * (progress < 0 ? 12 : -12)}%) scale(${0.94 + shift * 0.06})`,
                  transition,
                }}
              />
            )}

            <SlideCard
              key={`active-${active.id}`}
              service={active}
              muted={!soundOn}
              dragging={phase === 'drag'}
              interactive
              soundOn={soundOn}
              onToggleSound={() => setSoundOn((value) => !value)}
              blockLink={Math.abs(progress) > 0.01}
              style={{
                opacity: 1 - shift,
                transform: `translateX(${progress * 12}%) scale(${1 - shift * 0.06})`,
                transition,
              }}
            />
          </div>
        </div>

        <SideSlide
          service={next}
          side="right"
          onClick={() => clickSide(1)}
          fade={progress < 0 ? shift : 0}
        />
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {services.map((service, dotIndex) => (
          <button
            key={service.id}
            type="button"
            onClick={() => {
              if (settleRef.current) clearTimeout(settleRef.current);
              setProgress(0);
              setPhase('idle');
              setIndex(dotIndex);
            }}
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

/** Карточка слайда. Лежит в общем боксе абсолютом, поэтому слайды могут накладываться. */
function SlideCard({
  service,
  muted,
  dragging,
  interactive = false,
  soundOn = false,
  onToggleSound,
  blockLink = false,
  style,
}: {
  service: PublicService;
  muted: boolean;
  dragging: boolean;
  /** Только у активного слайда есть звук и ссылка: у проявляющегося они бы мешали. */
  interactive?: boolean;
  soundOn?: boolean;
  onToggleSound?: () => void;
  blockLink?: boolean;
  style: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 overflow-hidden rounded-2xl border border-amber-300/30 bg-slate-950',
        'shadow-[0_0_60px_-12px_rgba(251,191,36,0.35)]',
        !dragging && interactive && 'hover:shadow-[0_0_80px_-10px_rgba(251,191,36,0.5)]',
      )}
      style={style}
    >
      <SlideMedia service={service} muted={muted} playing />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />

      {interactive && (
        <button
          type="button"
          onClick={onToggleSound}
          aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-slate-950/70 text-slate-100 backdrop-blur transition hover:bg-slate-900"
        >
          {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="text-lg font-bold text-white drop-shadow sm:text-xl">{service.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{service.shortDesc}</p>
        {interactive && (
          <Link
            href={`/services/${service.slug}`}
            // Ссылку открываем только по настоящему клику: иначе свайп, начатый
            // с карточки, уводил бы со страницы.
            onClick={(event) => {
              if (blockLink) event.preventDefault();
            }}
            draggable={false}
            className="mt-3 inline-flex h-8 items-center rounded-full bg-amber-400 px-4 text-xs font-semibold text-slate-950 transition hover:bg-amber-300"
          >
            Выбрать этот шаблон
          </Link>
        )}
      </div>
    </div>
  );
}

/** Боковой слайд: уменьшенный, растворяется к краю и листает ленту по клику. */
function SideSlide({
  service,
  side,
  onClick,
  fade,
}: {
  service: PublicService;
  side: 'left' | 'right';
  onClick: () => void;
  /** 0..1 — насколько слайд уже «уехал» в центр во время протяжки. */
  fade: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Предыдущий шаблон' : 'Следующий шаблон'}
      className="relative hidden h-[220px] w-[180px] shrink-0 overflow-hidden rounded-xl border border-white/10 transition hover:opacity-70 lg:block"
      style={{ opacity: 0.45 * (1 - fade) }}
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
