import type { Metadata } from 'next';
import type { PublicService } from '@allvision/shared';
import { ServiceDetail } from '@/components/pages/ServiceDetail';
import { JsonLd } from '@/components/seo/JsonLd';
import { PUBLIC_API_URL, pageMetadata } from '@/lib/seo';
import { serviceBreadcrumbSchema, serviceSchema } from '@/lib/structured-data';

type ServicePageProps = {
  params: { slug: string };
};

async function getService(slug: string): Promise<PublicService | null> {
  try {
    const res = await fetch(`${PUBLIC_API_URL}/api/services/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { service?: PublicService };
    return data.service ?? null;
  } catch {
    return null;
  }
}

function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export async function generateMetadata({ params }: ServicePageProps): Promise<Metadata> {
  const service = await getService(params.slug);
  if (!service) {
    return pageMetadata({
      title: 'Услуга',
      description: 'AI-подарок в Allvision Studio: превью, описание, цена и запуск за несколько минут.',
      path: `/services/${params.slug}`,
    });
  }
  const description = truncate(
    service.shortDesc?.trim() || service.description || `${service.title} в Allvision Studio.`,
  );
  return pageMetadata({
    title: service.title,
    description,
    path: `/services/${service.slug}`,
    image: service.previewImage ?? service.coverImage,
    keywords: [service.title.toLowerCase(), 'нейросеть', 'AI подарок', 'онлайн'],
  });
}

export default async function ServicePage({ params }: ServicePageProps) {
  const service = await getService(params.slug);
  return (
    <>
      {service && <JsonLd data={[serviceSchema(service), serviceBreadcrumbSchema(service)]} />}
      <ServiceDetail slug={params.slug} />
    </>
  );
}
