import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ReduxProvider } from '@/components/providers/redux-provider';
import { Toaster } from '@/components/ui/toaster';
import { AppShell } from '@/components/layout/AppShell';
import { CookieBanner } from '@/components/CookieBanner';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://allvision.studio'),
  title: {
    default: 'Allvision Studio',
    template: '%s | Allvision Studio',
  },
  description:
    'AI-сервис для создания и обработки медиа. Улучшение старых фото, оживление, трендовые видео, персональные мультики и сказки для детей.',
  alternates: {
    languages: {
      ru: '/',
    },
  },
  openGraph: {
    title: 'Allvision Studio',
    description:
      'AI-сервис для создания и обработки медиа. Улучшение старых фото, оживление, трендовые видео, персональные мультики и сказки для детей.',
    url: 'https://allvision.studio',
    siteName: 'Allvision Studio',
    locale: 'ru_RU',
    type: 'website',
    images: [
      {
        url: '/logo_socialnetwork.png',
        width: 1672,
        height: 941,
        alt: 'Allvision Studio',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Allvision Studio',
    description:
      'AI-сервис для создания и обработки медиа. Улучшение старых фото, оживление, трендовые видео, персональные мультики и сказки для детей.',
    images: ['/logo_socialnetwork.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <body className={`${inter.variable} ${inter.className} min-h-screen flex flex-col antialiased`}>
        <ReduxProvider>
          <AppShell>{children}</AppShell>
          <CookieBanner />
          <Toaster />
        </ReduxProvider>
      </body>
    </html>
  );
}
