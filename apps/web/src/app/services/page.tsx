import type { Metadata } from 'next';
import type { ServiceCategory } from '@allvision/shared';
import { ServicesCatalog } from '@/components/pages/ServicesCatalog';

export const metadata: Metadata = {
  title: 'Цифровые подарки',
  description: 'Каталог Allvision Studio: оживление старых фото, трендовые видео, дети-герои и видео-открытки к особым поводам.',
};

type ServicesPageProps = {
  searchParams?: {
    category?: string;
  };
};

export default function ServicesPage({ searchParams }: ServicesPageProps) {
  return <ServicesCatalog initialCategory={searchParams?.category as ServiceCategory | undefined} />;
}
