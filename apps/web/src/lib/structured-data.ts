import type { PublicService } from '@allvision/shared';
import { merchantInfo } from './merchant';
import { absoluteImage, canonicalUrl, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from './seo';

type Schema = Record<string, unknown>;

export function organizationSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: ['Allvision', 'Allvision AI', 'Алвижн'],
    url: SITE_URL,
    logo: absoluteImage(DEFAULT_OG_IMAGE),
    email: merchantInfo.email,
    telephone: merchantInfo.phone,
    areaServed: 'RU',
    // Профили компании укрепляют распознавание бренда поисковиками и AI (entity).
    // Добавляй сюда реальные ссылки (VK, Telegram-канал, YouTube, Instagram).
    sameAs: [`https://t.me/${merchantInfo.supportTelegram.replace(/^@/, '')}`],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: merchantInfo.email,
        telephone: merchantInfo.phone,
        availableLanguage: ['Russian'],
      },
    ],
  };
}

export function websiteSchema(): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    alternateName: 'Allvision',
    url: SITE_URL,
    inLanguage: 'ru-RU',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_URL}/services?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqSchema(faqs: Array<{ question: string; answer: string }>): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

export function serviceSchema(service: PublicService): Schema {
  const path = `/services/${service.slug}`;
  const price = service.priceCoinsPro ?? service.priceCoinsStandard ?? null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: service.shortDesc || service.description,
    url: canonicalUrl(path),
    image: absoluteImage(service.previewImage ?? service.coverImage),
    serviceType: 'AI media generation',
    areaServed: 'RU',
    provider: { '@type': 'Organization', name: SITE_NAME, url: SITE_URL },
    // 1 токен ≈ 1 ₽ (см. финмодель), поэтому цену в Offer отдаём в рублях.
    ...(price !== null
      ? {
          offers: {
            '@type': 'Offer',
            price: String(price),
            priceCurrency: 'RUB',
            availability: 'https://schema.org/InStock',
            url: canonicalUrl(path),
          },
        }
      : {}),
  };
}

export function serviceBreadcrumbSchema(service: PublicService): Schema {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Услуги', item: canonicalUrl('/services') },
      { '@type': 'ListItem', position: 3, name: service.title, item: canonicalUrl(`/services/${service.slug}`) },
    ],
  };
}
