import type { Metadata } from 'next';
import { TrendsCatalog } from '@/components/pages/TrendsCatalog';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Трендовые видео из вашего фото',
  description: 'Каталог трендовых вертикальных видео Allvision Studio: танцы, мемы, свадебные форматы, футуристичные и милые ролики из вашего фото за минуты.',
  path: '/trends',
  keywords: ['трендовое видео из фото', 'лицо в меме нейросеть', 'танцующее фото ИИ'],
});

export default function TrendsPage() {
  return <TrendsCatalog />;
}
