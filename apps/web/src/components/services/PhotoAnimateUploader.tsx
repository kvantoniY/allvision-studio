'use client';

import { ProjectUploader } from './ProjectUploader';

export function PhotoAnimateUploader() {
  return (
    <ProjectUploader
      serviceSlug="photo-animate"
      tokensCost={80}
      ctaLabel="Оживить за 80 токенов"
      loginRedirect="/services/photo-animate"
    />
  );
}
