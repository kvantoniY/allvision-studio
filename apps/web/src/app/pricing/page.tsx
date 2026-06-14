import type { Metadata } from 'next';
import { PricingPageContent } from '@/components/pages/PricingPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Цены и пакеты коинов',
  description:
    'Прозрачные цены Allvision Studio: оплата за результат коинами без подписки. Пакеты пополнения и стоимость каждой AI-услуги видны до запуска.',
  path: '/pricing',
  keywords: ['цена нейросеть подарок', 'сколько стоит оживить фото', 'пакеты коинов Allvision'],
});

export default function PricingPage() {
  return <PricingPageContent />;
}
