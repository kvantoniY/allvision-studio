import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { offerSections } from '@/lib/legal-docs';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Публичная оферта',
  description: 'Публичная оферта Allvision Academy: индивидуальные онлайн-занятия, пакеты, запись, отмена и возвраты.',
  path: '/offer',
});

export default function OfferPage() {
  return (
    <LegalDocument
      title="Публичная оферта"
      description="Условия индивидуальных онлайн-занятий для детей, покупки пакетов, записи, отмены и возврата."
      sections={offerSections}
    />
  );
}
