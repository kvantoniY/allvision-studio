import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Сценарии и шаблоны видео',
  description: 'Готовые сценарии и шаблоны Allvision Studio: выберите формат, добавьте фото и получите персональное AI-видео или мультсцену за минуты.',
  path: '/scenarios',
  keywords: ['шаблоны видео нейросеть', 'сценарии AI видео', 'персональное видео из фото'],
});

export default function ScenariosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
