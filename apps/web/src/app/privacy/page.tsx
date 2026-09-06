import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { LegalDocument } from '@/components/legal/LegalDocument';
import { privacySections } from '@/lib/legal-docs';

export const metadata: Metadata = pageMetadata({
  title: 'Политика конфиденциальности',
  description: 'Политика конфиденциальности Allvision Studio: обработка персональных данных по 152-ФЗ, хранение, права пользователя и удаление данных.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Политика конфиденциальности"
      description="Как Allvision Studio собирает, использует, хранит и удаляет персональные данные пользователей."
      sections={privacySections}
    />
  );
}
