'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { useListServicesQuery } from '@/store/api/services-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

/** Сколько держать курсор до показа предпросмотра: меньше — и окно мигает при проходе мышью. */
const HOVER_DELAY_MS = 420;

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function coverOf(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage) ?? null;
}

function videoOf(service: PublicService) {
  if (service.previewMode === 'image') return null;
  return mediaUrl(service.previewVideo);
}

function priceOf(service: PublicService) {
  return service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens ?? 0;
}

/**
 * Наши услуги внутри панели ИИ.
 *
 * Человек в редакторе часто не знает, что вообще умеет платформа, а уходить в каталог за
 * этим — значит бросить наполовину собранный ролик. Поэтому услуги показываются здесь
 * маленькими карточками, а подробности открываются в этой же панели, без перехода.
 */
export function ServiceIdeaCards() {
  const { data, isLoading } = useListServicesQuery();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ service: PublicService; top: number; left: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  // Публичный список и так отдаёт только активные услуги — фильтровать нечего.
  const services = (data?.services ?? []).slice(0, 12);
  const opened = services.find((service) => service.slug === openSlug) ?? null;

  const scheduleHover = (service: PublicService, element: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      // Окно показываем справа от панели и прижимаем к экрану, чтобы оно не уехало за край.
      const top = Math.min(Math.max(12, rect.top - 40), window.innerHeight - 260);
      const left = Math.min(rect.right + 12, window.innerWidth - 300);
      setHovered({ service, top, left });
    }, HOVER_DELAY_MS);
  };

  const cancelHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(null);
  };

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60" />;
  }
  if (services.length === 0) return null;

  if (opened) {
    const video = videoOf(opened);
    const cover = coverOf(opened);
    return (
      <div className="space-y-2.5">
        <button
          type="button"
          onClick={() => setOpenSlug(null)}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 transition hover:text-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Назад к услугам
        </button>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          <div className="relative aspect-[16/10] bg-slate-900">
            {video ? (
              <video src={video} autoPlay muted loop playsInline className="h-full w-full object-cover" />
            ) : cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={opened.title} className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div className="space-y-2 p-3">
            <h4 className="text-sm font-semibold text-slate-100">{opened.title}</h4>
            <p className="text-xs leading-5 text-slate-400">{opened.shortDesc}</p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs font-semibold text-amber-300">от {priceOf(opened)} коинов</span>
              <Link
                href={`/services/${opened.slug}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-violet-300 transition hover:text-violet-200"
              >
                Открыть услугу
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-slate-300">Наши услуги</span>
        <Link href="/services" className="text-[11px] text-slate-500 transition hover:text-slate-300">
          Весь каталог
        </Link>
      </div>
      <p className="text-[11px] leading-4 text-slate-500">
        Готовые сценарии целиком. Наведите и задержите курсор — покажем превью.
      </p>

      <div className="grid grid-cols-3 gap-1.5">
        {services.map((service) => {
          const cover = coverOf(service);
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => {
                cancelHover();
                setOpenSlug(service.slug);
              }}
              onPointerEnter={(event) => scheduleHover(service, event.currentTarget)}
              onPointerLeave={cancelHover}
              className="group relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition hover:border-violet-400"
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
              ) : (
                <span className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-slate-950/85 px-1 py-0.5 text-[10px] leading-tight text-slate-200">
                <span className="line-clamp-2">{service.title}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Предпросмотр рисуется поверх всего: панель узкая, внутри неё окну не поместиться. */}
      {hovered && <HoverPreview service={hovered.service} top={hovered.top} left={hovered.left} />}
    </div>
  );
}

function HoverPreview({ service, top, left }: { service: PublicService; top: number; left: number }) {
  const video = videoOf(service);
  const cover = coverOf(service);

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-50 w-72 overflow-hidden rounded-xl border border-slate-700',
        'bg-slate-950/95 shadow-2xl shadow-black/60 backdrop-blur',
      )}
      style={{ top, left }}
    >
      <div className="relative aspect-[16/10] bg-slate-900">
        {video ? (
          <video src={video} autoPlay muted loop playsInline className="h-full w-full object-cover" />
        ) : cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="p-2.5">
        <div className="text-xs font-semibold text-slate-100">{service.title}</div>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-400">{service.shortDesc}</p>
      </div>
    </div>
  );
}
