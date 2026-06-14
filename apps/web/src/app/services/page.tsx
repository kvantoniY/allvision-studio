import type { Metadata } from 'next';
import type { ServiceCategory } from '@allvision/shared';
import { ServicesCatalog } from '@/components/pages/ServicesCatalog';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'AI-подарки и услуги: оживить фото, видео, мультфильмы',
  description:
    'Каталог Allvision Studio: оживление и реставрация старых фото, перенос себя в фильм или мультфильм, трендовые видео, карусели для соцсетей и подарки к особым поводам. Готовый результат за минуты.',
  path: '/services',
  keywords: [
    'оживить старое фото',
    'реставрация фото нейросеть',
    'я в фильме нейросеть',
    'ребёнок в мультфильме',
    'трендовое видео ИИ',
    'карусель для поста нейросеть',
  ],
});

type ServicesPageProps = {
  searchParams?: {
    category?: string;
  };
};

export default function ServicesPage({ searchParams }: ServicesPageProps) {
  return <ServicesCatalog initialCategory={searchParams?.category as ServiceCategory | undefined} />;
}
