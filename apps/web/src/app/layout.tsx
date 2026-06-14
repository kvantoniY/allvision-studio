import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ReduxProvider } from '@/components/providers/redux-provider';
import { Toaster } from '@/components/ui/toaster';
import { AppShell } from '@/components/layout/AppShell';
import { CookieBanner } from '@/components/CookieBanner';
import { SITE_NAME, SITE_URL } from '@/lib/seo';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
});

const DEFAULT_DESCRIPTION =
  'Allvision Studio — AI-фабрика цифровых подарков: оживление и реставрация старых фото, перенос себя в фильм или мультфильм, трендовые видео, карусели для соцсетей, аватары и сказки. Результат за минуты, без промптов.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Allvision Studio — AI-подарки: оживить фото, видео, мультфильмы',
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    'нейросеть подарок',
    'оживить старое фото',
    'реставрация фото нейросеть',
    'я в фильме нейросеть',
    'ребёнок в мультфильме',
    'трендовое видео ИИ',
    'AI генерация фото и видео',
    'карусель для поста нейросеть',
    'Allvision Studio',
  ],
  alternates: {
    canonical: '/',
    languages: { ru: '/' },
  },
  openGraph: {
    title: 'Allvision Studio — AI-фабрика цифровых подарков',
    description: DEFAULT_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: 'ru_RU',
    type: 'website',
    images: [
      {
        url: '/logo_socialnetwork.png',
        width: 1672,
        height: 941,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Allvision Studio — AI-фабрика цифровых подарков',
    description: DEFAULT_DESCRIPTION,
    images: ['/logo_socialnetwork.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  verification: {
    ...(process.env.NEXT_PUBLIC_YANDEX_VERIFICATION ? { yandex: process.env.NEXT_PUBLIC_YANDEX_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION } : {}),
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
