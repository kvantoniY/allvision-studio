import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { termsSections } from '@/lib/legal-docs';

export const metadata: Metadata = pageMetadata({
  title: 'Пользовательское соглашение',
  description: 'Пользовательское соглашение Allvision Studio: правила использования, аккаунт, ограничения контента и ответственность сторон.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalDocument
      title="Пользовательское соглашение"
      description="Основные правила использования сайта, аккаунта, AI-генерации и заказных услуг Allvision Studio."
      sections={termsSections}
    />
  );
}
