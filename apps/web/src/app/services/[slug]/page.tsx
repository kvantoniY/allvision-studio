import type { Metadata } from 'next';
import { ServiceDetail } from '@/components/pages/ServiceDetail';

type ServicePageProps = {
  params: { slug: string };
};

export function generateMetadata({ params }: ServicePageProps): Metadata {
  return {
    title: `Подарок ${params.slug}`,
    description: 'Страница услуги Allvision Studio: превью, описание, выбор качества, форма запуска и цена в коинах.',
  };
}

export default function ServicePage({ params }: ServicePageProps) {
  return <ServiceDetail slug={params.slug} />;
}
