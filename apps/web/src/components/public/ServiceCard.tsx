import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { tokensToRub, type PublicService } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { getServiceBadgeLabel } from '@/lib/public-content';
import { cn } from '@/lib/utils';

import { TokenIcon } from '@/components/ui/token-icon';
type ServiceCardProps = {
  service: PublicService;
  detailed?: boolean;
  className?: string;
};

export function ServiceCard({ service, detailed = false, className }: ServiceCardProps) {
  const isRubPrice = service.slug === 'cartoon-custom' || service.slug === 'realistic-custom';
  const isFairyTale = service.slug === 'fairy-tale';

  return (
    <Card
      className={cn(
        'group flex h-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/50 hover:shadow-2xl hover:shadow-violet-500/10',
        className,
      )}
    >
      <Link href={`/services/${service.slug}`} className="block overflow-hidden">
        <Image
          src={service.coverImage ?? service.galleryImages[0]}
          alt={service.title}
          width={800}
          height={600}
          className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
        />
      </Link>
      <CardHeader className="flex flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="bg-slate-800 text-indigo-100 hover:bg-slate-700">
            {getServiceBadgeLabel(service)}
          </Badge>
        </div>
        <div className="flex flex-1 flex-col">
          <h3 className="text-xl font-bold tracking-tight text-slate-50">{service.title}</h3>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-400">
            {detailed ? service.description.split('\n\n')[0] : service.shortDesc}
          </p>
          <div className="mt-5 flex items-baseline gap-2">
            <TokenIcon className="h-5 w-5 shrink-0 text-amber-400" />
            <span className="text-lg font-bold text-amber-400">
              {isRubPrice ? `от ${service.priceTokens} ₽/мин` : `${service.priceTokens} токенов`}
            </span>
            <span className="text-sm text-slate-500">
              {isRubPrice ? 'по заявке' : isFairyTale ? 'видео от 4990 ₽' : `≈ ${tokensToRub(service.priceTokens)} ₽`}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="mt-auto">
        <Button asChild variant="outline" className="w-full border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700 hover:text-white">
          <Link href={`/services/${service.slug}`}>
            Подробнее
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
