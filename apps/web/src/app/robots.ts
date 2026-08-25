import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Приватные/служебные разделы закрыты от индексации — в выдачу должны попадать
// только публичные витринные страницы.
const DISALLOW = [
  '/dashboard',
  '/admin',
  '/ai',
  '/studio',
  '/profile',
  '/api',
  '/mock-payment',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
