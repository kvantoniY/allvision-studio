import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { termsSections } from '@/lib/legal-docs';

export const metadata: Metadata = {
  title: 'Пользовательское соглашение',
  description: 'Пользовательское соглашение Allvision Studio: правила использования, аккаунт, ограничения контента и ответственность сторон.',
};

export default function TermsPage() {
  return (
    <LegalDocument
      title="Пользовательское соглашение"
      description="Основные правила использования сайта, аккаунта, AI-генерации и заказных услуг Allvision Studio."
      sections={termsSections}
    />
  );
}
