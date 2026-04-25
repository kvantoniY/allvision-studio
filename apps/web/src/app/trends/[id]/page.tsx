import type { Metadata } from 'next';
import { TrendDetail } from '@/components/pages/TrendDetail';

type TrendPageProps = {
  params: { id: string };
};

export function generateMetadata({ params }: TrendPageProps): Metadata {
  return {
    title: `Тренд ${params.id}`,
    description: 'Детальная страница трендового видео Allvision Studio: превью, описание, теги и стоимость создания.',
  };
}

export default function TrendPage({ params }: TrendPageProps) {
  return <TrendDetail id={params.id} />;
}
