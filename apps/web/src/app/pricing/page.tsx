import type { Metadata } from 'next';
import { PricingPageContent } from '@/components/pages/PricingPageContent';

export const metadata: Metadata = {
  title: 'Цены и токены',
  description: 'Пакеты токенов Allvision Studio: простая оплата за AI-обработку фото, оживление портретов и трендовые видео.',
};

export default function PricingPage() {
  return <PricingPageContent />;
}
