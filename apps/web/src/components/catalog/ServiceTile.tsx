'use client';

import Link from 'next/link';
import type { PublicService } from '@allvision/shared';
import { FallbackImage } from '@/components/ui/fallback-image';
import { PreviewVideo } from '@/components/ui/preview-video';
import { Badge } from '@/components/ui/badge';
import { coverCropStyle } from '@/lib/cover-crop';
import { cn } from '@/lib/utils';
import { mediaUrl, previewFrom, servicePriceCoins } from './catalog-utils';

type ServiceTileProps = {
  service: PublicService;
  /** Крупная карточка для кураторской ленты «Популярное». */
  size?: 'default' | 'large';
  /** Показывать цену на карточке (в популярном это помогает выбрать). */
  showPrice?: boolean;
};

export function ServiceTile({ service, size = 'default', showPrice = false }: ServiceTileProps) {
  const previewVideo = mediaUrl(service.previewVideo);
  const previewImage = previewFrom(service);
  const showVideo = service.previewMode === 'video'
    ? Boolean(previewVideo)
    : service.previewMode === 'image'
      ? false
      : Boolean(previewVideo);
  const price = servicePriceCoins(service);

  return (
    <Link href={`/services/${service.slug}`} className="group block">
      <div
        className={cn(
          'relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 transition group-hover:border-amber-400/70',
          size === 'large' ? 'aspect-[4/5] sm:aspect-[16/10]' : 'aspect-[16/10]',
        )}
      >
        {showVideo && previewVideo ? (
          <PreviewVideo src={previewVideo} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
        ) : (
          <FallbackImage
            src={previewImage}
            alt={service.title}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
            style={coverCropStyle(service.coverCrop)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
        {service.isFeatured && (
          <Badge className="absolute left-2.5 top-2.5 border-amber-300/60 bg-amber-400 px-2 py-0.5 text-[11px] text-slate-950">
            Популярное
          </Badge>
        )}
        <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2">
          <div
            className={cn(
              'min-w-0 flex-1 truncate font-semibold text-white drop-shadow-md',
              size === 'large' ? 'text-base sm:text-lg' : 'text-sm',
            )}
          >
            {service.title}
          </div>
          {showPrice && price > 0 && (
            <span className="shrink-0 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-amber-300 backdrop-blur">
              {price} к
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
