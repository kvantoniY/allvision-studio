import type { Metadata } from 'next';
import { ServicesCatalog } from '@/components/pages/ServicesCatalog';

export const metadata: Metadata = {
  title: 'Все услуги',
  description: 'Каталог услуг Allvision Studio: AI-реставрация фото, оживление портретов, трендовые видео и персональные ролики на заказ.',
};

export default function ServicesPage() {
  return <ServicesCatalog />;
}
