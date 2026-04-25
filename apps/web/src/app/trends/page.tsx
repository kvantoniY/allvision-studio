import type { Metadata } from 'next';
import { TrendsCatalog } from '@/components/pages/TrendsCatalog';

export const metadata: Metadata = {
  title: 'Трендовые видео',
  description: 'Каталог трендовых вертикальных видео Allvision Studio: танцы, мемы, свадебные форматы, футуристичные и милые ролики.',
};

export default function TrendsPage() {
  return <TrendsCatalog />;
}
