import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

const publicPaths = ['', '/about', '/contacts', '/privacy', '/terms', '/offer', '/pd-consent'];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return publicPaths.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === '' ? 'weekly' : 'monthly',
    priority: path === '' ? 1 : path === '/about' ? 0.7 : 0.5,
  }));
}
