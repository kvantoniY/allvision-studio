import type { Metadata } from 'next';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { privacySections } from '@/lib/legal-docs';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Политика конфиденциальности',
  description: 'Политика конфиденциальности Allvision Academy: данные родителя и ребёнка, закрытые AI-материалы, доступ, хранение и удаление.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Политика конфиденциальности"
      description="Как Allvision Academy обрабатывает данные родителя и ребёнка, защищает фотографии и AI-материалы и исполняет запросы на удаление."
      sections={privacySections}
    />
  );
}
