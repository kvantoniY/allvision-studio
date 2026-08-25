import type { Metadata } from 'next';

// Единый источник публичного домена. Раньше домен был зашит как allvision.studio
// в layout/sitemap — из-за этого canonical, OG и карта сайта указывали на чужой адрес.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://allvision-pulse.ru').replace(/\/+$/, '');
export const SITE_NAME = 'Allvision Studio';
export const DEFAULT_OG_IMAGE = '/logo_socialnetwork.png';

// Для серверных fetch публичных данных (sitemap, метаданные услуг).
export const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? SITE_URL : 'http://localhost:4000');

export function canonicalUrl(path = '/'): string {
  const clean = path === '/' || path === '' ? '' : `/${path.replace(/^\/+/, '')}`;
  return `${SITE_URL}${clean}`;
}

export function absoluteImage(image?: string | null): string {
  const src = image && image.trim().length > 0 ? image : DEFAULT_OG_IMAGE;
  if (/^https?:\/\//.test(src)) return src;
  if (src.startsWith('/static/')) return `${PUBLIC_API_URL}${src}`;
  return `${SITE_URL}${src.startsWith('/') ? src : `/${src}`}`;
}

// Собирает Metadata с canonical + OpenGraph + Twitter из одного места,
// чтобы каждая публичная страница не дублировала boilerplate.
export function pageMetadata(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  image?: string | null;
  type?: 'website' | 'article';
  absoluteTitle?: boolean;
}): Metadata {
  const url = canonicalUrl(opts.path);
  const image = absoluteImage(opts.image);
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    ...(opts.keywords && opts.keywords.length > 0 ? { keywords: opts.keywords } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url,
      siteName: SITE_NAME,
      locale: 'ru_RU',
      type: opts.type ?? 'website',
      images: [{ url: image }],
    },
    twitter: {
      card: 'summary_large_image',
      title: opts.title,
      description: opts.description,
      images: [image],
    },
  };
}
