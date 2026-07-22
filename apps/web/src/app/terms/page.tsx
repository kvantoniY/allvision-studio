import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { termsSections } from '@/lib/legal-docs';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Пользовательское соглашение',
  description: 'Пользовательское соглашение Allvision Academy: аккаунты, полномочия родителя, правила занятий и AI-материалов.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <LegalDocument
      title="Пользовательское соглашение"
      description="Правила использования кабинета, участия ребёнка в занятиях, общения и работы с персональными AI-материалами."
      sections={termsSections}
    />
  );
}
