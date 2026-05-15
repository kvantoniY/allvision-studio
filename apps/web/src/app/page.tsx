import type { Metadata } from 'next';
import { HomePageContent } from '@/components/pages/HomePageContent';

export const metadata: Metadata = {
  title: 'Allvision Studio — AI-генерация фото и видео',
  description:
    'Трендовые AI-услуги, свободный Allvision AI чат, фото- и видеомодели, аватары, локации и генерации без подписки.',
};

export default function HomePage() {
  return <HomePageContent />;
}
