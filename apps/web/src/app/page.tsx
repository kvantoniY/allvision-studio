import type { Metadata } from 'next';
import { AcademyHome } from '@/components/academy/AcademyHome';
import { ProgramsSection, TeachersSection } from '@/components/academy/LandingShowcase';
import { JsonLd } from '@/components/seo/JsonLd';
import { pageMetadata } from '@/lib/seo';
import { ACADEMY_FAQS } from '@/lib/academy-landing-content';
import { faqSchema, organizationSchema, websiteSchema } from '@/lib/structured-data';

export const metadata: Metadata = pageMetadata({
  title: 'Allvision Academy — персональная онлайн-школа для детей',
  description:
    'Персонализированная онлайн-школа: живой преподаватель ведёт занятие, нейросети создают персонажа с внешностью ребёнка, а браузерная игра превращает урок в интерактивное приключение. Английский, нейросети, программирование.',
  path: '/',
  absoluteTitle: true,
  keywords: [
    'онлайн школа для детей',
    'английский для детей онлайн',
    'нейросети для детей',
    'программирование для детей',
    'персональные уроки с преподавателем',
  ],
});

export default function HomePage() {
  return (
    <>
      <JsonLd data={[organizationSchema(), websiteSchema(), faqSchema([...ACADEMY_FAQS])]} />
      {/* Преподаватели и программы читаются из БД на сервере и передаются в клиентский
          лендинг слотами: серверные компоненты нельзя импортировать внутрь 'use client'. */}
      <AcademyHome teachersSlot={<TeachersSection />} programsSlot={<ProgramsSection />} />
    </>
  );
}
