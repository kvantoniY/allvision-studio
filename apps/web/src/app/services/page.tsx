import type { Metadata } from 'next';
import { ServicesCatalog } from '@/components/pages/ServicesCatalog';

export const metadata: Metadata = {
  title: 'Цифровые подарки',
  description: 'Каталог Allvision Studio: оживление старых фото, трендовые видео, дети-герои и видео-открытки к особым поводам.',
};

export default function ServicesPage() {
  return <ServicesCatalog />;
}
