import type { MetadataRoute } from 'next';
import { PUBLIC_API_URL, SITE_URL } from '@/lib/seo';

const staticPaths = [
  '',
  '/services',
  '/trends',
  '/scenarios',
  '/pricing',
  '/about',
  '/contacts',
  '/support',
  '/privacy',
  '/terms',
  '/offer',
  '/pd-consent',
];

async function fetchJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${PUBLIC_API_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Реальные услуги из БД (а не статический legacy-список), чтобы новые услуги
// попадали в карту сайта автоматически.
async function getServicePaths(): Promise<string[]> {
  const data = await fetchJson<{ services?: Array<{ slug: string }>; items?: Array<{ slug: string }> }>('/api/services');
  const list = data?.services ?? data?.items ?? [];
  return list.filter((s) => s?.slug).map((s) => `/services/${s.slug}`);
}

async function getTrendPaths(): Promise<string[]> {
  const data = await fetchJson<{ trends?: Array<{ id: string }> }>('/api/public/trends');
  return (data?.trends ?? []).map((t) => `/trends/${t.id}`);
}

async function getScenarioPaths(): Promise<string[]> {
  const data = await fetchJson<{ templates?: Array<{ slug: string }>; scenarios?: Array<{ slug: string }> }>('/api/public/scenario-templates');
  const list = data?.templates ?? data?.scenarios ?? [];
  return list.filter((s) => s?.slug).map((s) => `/scenarios/${s.slug}`);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [services, trends, scenarios] = await Promise.all([
    getServicePaths(),
    getTrendPaths(),
    getScenarioPaths(),
  ]);
  const paths = Array.from(new Set([...staticPaths, ...services, ...trends, ...scenarios]));

  return paths.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'daily' : path.startsWith('/services') ? 'weekly' : 'weekly',
    priority: path === ''
      ? 1
      : path.startsWith('/services/')
        ? 0.9
        : path === '/services'
          ? 0.8
          : 0.6,
  }));
}
