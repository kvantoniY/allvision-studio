'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { PublicService } from '@allvision/shared';
import { FallbackImage } from '@/components/ui/fallback-image';
import { PreviewVideo } from '@/components/ui/preview-video';
import { coverCropStyle } from '@/lib/cover-crop';
import { mediaUrl, previewFrom, servicePriceCoins } from './catalog-utils';

/**
 * Обложка вкладки — одна крупная работа наверху каталога.
 *
 * Раньше вкладка «Популярное» была мозаикой из карточек трёх размеров: глаз не понимал, что
 * важнее, а разные пропорции обложек делали ленту рваной. Теперь наверху ровно одна большая
 * работа как витринный образец, а всё остальное — одинаковые карточки под ней.
 */
export function CatalogHero({ service }: { service: PublicService }) {
  const previewVideo = mediaUrl(service.previewVideo);
  const showVideo = service.previewMode === 'image' ? false : Boolean(previewVideo);
  const price = servicePriceCoins(service);

  return (
    <Link
      href={`/services/${service.slug}`}
      className="group relative block overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 transition hover:border-amber-400/60"
    >
      <div className="relative aspect-[4/3] sm:aspect-[21/9]">
        {showVideo && previewVideo ? (
          <PreviewVideo
            src={previewVideo}
            className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <FallbackImage
            src={previewFrom(service)}
            alt={service.title}
            className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
            style={coverCropStyle(service.coverCrop)}
          />
        )}

        {/* Затемнение слева направо: текст читается поверх любой обложки, а сама картинка
            остаётся видна справа. */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-transparent to-transparent" />

        <div className="absolute inset-0 flex flex-col justify-end gap-3 p-5 sm:max-w-xl sm:justify-center sm:p-8 lg:p-10">
          <span className="w-fit rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-300">
            Выбор Allvision
          </span>
          <h2 className="text-2xl font-black leading-tight tracking-tight text-white drop-shadow sm:text-4xl">
            {service.title}
          </h2>
          <p className="line-clamp-2 max-w-lg text-sm leading-6 text-slate-300 sm:text-base">
            {service.shortDesc}
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-400 px-5 text-sm font-semibold text-slate-950 transition group-hover:bg-amber-300">
              Открыть
              <ArrowRight className="h-4 w-4" />
            </span>
            {price > 0 && (
              <span className="text-sm font-semibold text-slate-300">от {price} токенов</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
