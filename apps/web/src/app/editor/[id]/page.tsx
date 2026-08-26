'use client';

import { use } from 'react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { VideoEditor } from '@/components/editor/VideoEditor';

export default function EditorProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <AuthGuard>
      <VideoEditor id={id} />
    </AuthGuard>
  );
}
