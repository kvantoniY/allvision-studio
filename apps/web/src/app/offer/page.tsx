import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { offerSections } from '@/lib/legal-docs';

export const metadata: Metadata = pageMetadata({
  title: 'Публичная оферта',
  description: 'Публичная оферта Allvision Studio: предмет договора, оплата, доставка результата, возвраты и форс-мажор.',
  path: '/offer',
});

export default function OfferPage() {
  return (
    <LegalDocument
      title="Публичная оферта"
      description="Условия оказания услуг по генерации, обработке и созданию цифрового медиа-контента."
      sections={offerSections}
    />
  );
}
