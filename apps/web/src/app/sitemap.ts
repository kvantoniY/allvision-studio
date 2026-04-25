import type { MetadataRoute } from 'next';
import type { PublicTrendsResponse } from '@allvision/shared';
import { serviceLinks } from '@/lib/public-content';

const baseUrl = 'https://allvision.studio';
const staticPaths = [
  '',
  '/services',
  '/trends',
  '/pricing',
  '/about',
  '/contacts',
  '/privacy',
  '/terms',
  '/offer',
  '/pd-consent',
];

async function getTrendPaths() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    const response = await fetch(`${apiUrl}/api/public/trends`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = (await response.json()) as PublicTrendsResponse;
    return data.trends.map((trend) => `/trends/${trend.id}`);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const trendPaths = await getTrendPaths();
  const paths = [...staticPaths, ...serviceLinks.map((link) => link.href), ...trendPaths];

  return paths.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '' ? 'daily' : 'weekly',
    priority: path === '' ? 1 : path.startsWith('/services/') ? 0.8 : 0.7,
  }));
}
