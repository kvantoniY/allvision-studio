import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { pdConsentSections } from '@/lib/legal-docs';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Согласие на обработку ПДн',
  description: 'Отдельное согласие пользователя на обработку персональных данных в Allvision Academy и порядок согласий на данные ребёнка.',
  path: '/pd-consent',
});

export default function PdConsentPage() {
  return (
    <LegalDocument
      title="Согласие на обработку персональных данных"
      description="Отдельное согласие совершеннолетнего пользователя; согласия на изображения и AI-материалы ребёнка оформляются в семейном кабинете."
      sections={pdConsentSections}
    />
  );
}
