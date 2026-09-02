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

/** Доля ширины, после которой отпускание докручивает карусель, а не возвращает её назад. */
const COMMIT_RATIO = 0.18;
/** Длительность доводки после отпускания — столько же живёт CSS-переход. */
const SETTLE_MS = 340;
/** Сколько соседей держим по каждую сторону: дальше карточки всё равно за краем экрана. */
const NEIGHBOURS = 2;

/**
 * Карусель готовых шаблонов.
 *
 * Ключевое здесь — непрерывность. У каждой карточки есть позиция относительно центра
 * (−2, −1, 0, 1, 2), к которой во время жеста прибавляется дробный сдвиг пальца. Из этой
 * ОДНОЙ величины считается всё: смещение, масштаб, прозрачность и обесцвечивание. Поэтому
 * при медленной протяжке соседняя карточка не «переключается», а едет к центру, набирая
 * цвет и размер, — лента вращается, а не мигает.
 *
 * Прежняя версия растворяла центральную карточку в соседней на месте: жест был, а ощущения
 * прокрутки не возникало — ничего никуда не ехало.
 */
export function TemplateSlider({ services }: { services: PublicService[] }) {
  const [index, setIndex] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  /** Дробный сдвиг ленты в карточках: −1 — ушли на одну вправо, +1 — влево. */
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [width, setWidth] = useState(0);
  const dragRef = useRef<{ startX: number; moved: boolean } | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = services.length;

  useEffect(() => {
    setIndex(0);
  }, [total]);

  // Ширина нужна и для перевода пикселей жеста в доли карточки, и для раскладки соседей.
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return;
    const update = () => setWidth(node.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (settleRef.current) clearTimeout(settleRef.current);
  }, []);

  /**
   * Доводка: сначала докручиваем ленту до соседней карточки, и только потом меняем индекс.
   *
   * Если поменять индекс сразу, лента прыгнет: карточка окажется в центре без движения.
   */
  const settle = useCallback(
    (direction: -1 | 0 | 1) => {
      if (settleRef.current) clearTimeout(settleRef.current);
      setDragging(false);
      // Лента едет ПРОТИВ направления перехода: чтобы показать следующую карточку
      // (direction +1), полосу надо увести влево, то есть в минус.
      setProgress(-direction);
      settleRef.current = setTimeout(() => {
        if (direction !== 0) setIndex((current) => ((current + direction) % total + total) % total);
        setProgress(0);
      }, SETTLE_MS);
    },
    [total],
  );

  if (total === 0) return null;

  // Карточка шириной чуть больше половины ленты: соседи должны заглядывать с обеих сторон.
  const cardWidth = Math.min(520, Math.max(220, width * 0.62));
  const step = cardWidth * 0.78;

  const beginDrag = (clientX: number) => {
    if (settleRef.current) clearTimeout(settleRef.current);
    dragRef.current = { startX: clientX, moved: false };
    setDragging(true);
  };

  const moveDrag = (clientX: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaPx = clientX - drag.startX;
    if (Math.abs(deltaPx) > 4) drag.moved = true;
    // Жест меряем в карточках, а не в пикселях: на телефоне и на мониторе «одна карточка»
    // должна означать одно и то же расстояние пальца.
    setProgress(Math.max(-1.2, Math.min(1.2, deltaPx / step)));
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

  const dragged = () => Math.abs(progress) > 0.02;

  /** Видимые карточки: центральная плюс соседи. Индексы закольцованы. */
  const slots = [] as Array<{ service: PublicService; slot: number; key: string }>;
  const span = Math.min(NEIGHBOURS, Math.max(0, Math.floor((total - 1) / 2)));
  for (let slot = -span; slot <= span; slot += 1) {
    const serviceIndex = ((index + slot) % total + total) % total;
    slots.push({ service: services[serviceIndex], slot, key: `${serviceIndex}-${slot}` });
  }

  const transition = dragging ? 'none' : `transform ${SETTLE_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SETTLE_MS}ms ease-out, filter ${SETTLE_MS}ms ease-out`;

  return (
    <div className="relative select-none">
      {/* Светящаяся дуга позади ленты: статичная, без пересчётов на скролле. */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-64 max-w-3xl rounded-[100%] bg-amber-400/10 blur-[90px]" />

      <div
        ref={boxRef}
        className="relative touch-pan-y overflow-hidden"
        style={{ height: cardWidth * 0.72 }}
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
        {slots.map(({ service, slot, key }) => {
          // Одна величина на всё: и положение, и размер, и цвет.
          // Плюс, а не минус: содержимое обязано ехать ЗА пальцем. С минусом лента шла в
          // одну сторону, а доводка после отпускания — в другую, и получался прыжок через
          // карточку.
          const position = slot + progress;
          const distance = Math.abs(position);
          const centered = distance < 0.5;
          return (
            <div
              key={key}
              className="absolute left-1/2 top-1/2"
              style={{
                width: cardWidth,
                height: cardWidth * 0.68,
                transform: `translate(-50%, -50%) translateX(${position * step}px) scale(${Math.max(0.68, 1 - distance * 0.16)})`,
                // Дальние карточки уходят в тень и обесцвечиваются — центр всегда читается первым.
                opacity: Math.max(0, 1 - distance * 0.42),
                filter: `brightness(${Math.max(0.35, 1 - distance * 0.5)}) saturate(${Math.max(0.25, 1 - distance * 0.6)})`,
                zIndex: 10 - Math.round(distance * 10),
                transition,
              }}
            >
              <SlideCard
                service={service}
                centered={centered}
                soundOn={soundOn}
                dragging={dragging}
                onToggleSound={() => setSoundOn((value) => !value)}
                onSideClick={() => {
                  if (dragged()) return;
                  settle(position > 0 ? 1 : -1);
                }}
                blockLink={dragged()}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-center gap-1.5">
        {services.map((service, dotIndex) => (
          <button
            key={service.id}
            type="button"
            onClick={() => {
              if (settleRef.current) clearTimeout(settleRef.current);
              setProgress(0);
              setDragging(false);
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

/**
 * Карточка ленты.
 *
 * Кнопка звука и ссылка есть только у центральной: на боковой они бы ловили клики, которыми
 * ленту листают.
 */
function SlideCard({
  service,
  centered,
  soundOn,
  dragging,
  onToggleSound,
  onSideClick,
  blockLink,
}: {
  service: PublicService;
  centered: boolean;
  soundOn: boolean;
  dragging: boolean;
  onToggleSound: () => void;
  onSideClick: () => void;
  blockLink: boolean;
}) {
  return (
    <div
      onClick={centered ? undefined : onSideClick}
      className={cn(
        'relative h-full w-full overflow-hidden rounded-2xl border bg-slate-950',
        centered
          ? 'border-amber-300/40 shadow-[0_0_60px_-12px_rgba(251,191,36,0.35)]'
          : 'cursor-pointer border-white/10',
        !dragging && centered && 'transition-shadow hover:shadow-[0_0_80px_-10px_rgba(251,191,36,0.5)]',
      )}
    >
      <SlideMedia service={service} muted={!centered || !soundOn} playing={centered} />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/25 to-transparent" />

      {centered && (
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
        {centered && (
          <Link
            href={`/services/${service.slug}`}
            // Ссылку открываем только по настоящему клику: иначе свайп, начатый с карточки,
            // уводил бы со страницы.
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
        // Боковые карточки целиком не грузим: их на экране несколько, и трафик ни к чему.
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
