import type { Metadata } from 'next';
import { PricingPageContent } from '@/components/pages/PricingPageContent';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Цены и пакеты токенов',
  description:
    'Прозрачные цены Allvision Studio: оплата за результат токенами без подписки. Пакеты пополнения и стоимость каждой AI-услуги видны до запуска.',
  path: '/pricing',
  keywords: ['цена нейросеть подарок', 'сколько стоит оживить фото', 'пакеты токенов Allvision'],
});

export default function PricingPage() {
  return <PricingPageContent />;
}
