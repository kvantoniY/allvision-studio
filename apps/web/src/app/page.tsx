import type { Metadata } from 'next';
import { HomePageContent } from '@/components/pages/HomePageContent';
import { JsonLd } from '@/components/seo/JsonLd';
import { landingFaqs } from '@/lib/public-content';
import { pageMetadata } from '@/lib/seo';
import { faqSchema, organizationSchema, websiteSchema } from '@/lib/structured-data';

export const metadata: Metadata = pageMetadata({
  title: 'Allvision Studio — AI-подарки: оживить фото, видео, мультфильмы',
  description:
    'AI-фабрика цифровых подарков: оживление и реставрация старых фото, перенос себя в фильм или мультфильм, трендовые видео, карусели для соцсетей, аватары и сказки. Результат за минуты, без промптов и подписки.',
  path: '/',
  absoluteTitle: true,
  keywords: [
    'нейросеть подарок',
    'оживить старое фото',
    'я в фильме нейросеть',
    'ребёнок в мультфильме',
    'AI генерация фото и видео',
  ],
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema(), faqSchema(landingFaqs)]} />
      <HomePageContent />
    </>
  );
}
