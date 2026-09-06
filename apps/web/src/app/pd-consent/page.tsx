import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { pdConsentSections } from '@/lib/legal-docs';

export const metadata: Metadata = pageMetadata({
  title: 'Согласие на обработку ПДн',
  description: 'Согласие на обработку персональных данных Allvision Studio, включая трансграничную передачу для AI-провайдеров.',
  path: '/pd-consent',
});

export default function PdConsentPage() {
  return (
    <LegalDocument
      title="Согласие на обработку персональных данных"
      description="Явное согласие пользователя на обработку персональных данных и трансграничную передачу для оказания AI-услуг."
      sections={pdConsentSections}
    />
  );
}
