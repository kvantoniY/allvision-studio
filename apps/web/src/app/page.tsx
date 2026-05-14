import type { Metadata } from 'next';
import { HomePageContent } from '@/components/pages/HomePageContent';

export const metadata: Metadata = {
  title: 'Allvision Studio — цифровые подарки за минуты',
  description:
    'Allvision Studio помогает выбрать повод и формат подарка: оживить старое фото, собрать трендовое видео, сделать ребёнка героем мультика или подготовить видео-открытку.',
};

export default function HomePage() {
  return <HomePageContent />;
}
