'use client';

import { ProjectUploader } from './ProjectUploader';

export function PhotoRestoreUploader() {
  return (
    <ProjectUploader
      serviceSlug="photo-restore"
      tokensCost={20}
      ctaLabel="Улучшить за 20 токенов"
      loginRedirect="/services/photo-restore"
    />
  );
}
