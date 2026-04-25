import type { Metadata } from 'next';
import { ServiceDetail } from '@/components/pages/ServiceDetail';

type ServicePageProps = {
  params: { slug: string };
};

export function generateMetadata({ params }: ServicePageProps): Metadata {
  return {
    title: `Услуга ${params.slug}`,
    description: 'Детальная страница услуги Allvision Studio: описание, примеры, цена, процесс и похожие услуги.',
  };
}

export default function ServicePage({ params }: ServicePageProps) {
  return <ServiceDetail slug={params.slug} />;
}
