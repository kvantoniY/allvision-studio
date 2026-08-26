'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { VideoProjectList } from '@/components/editor/VideoProjectList';

export default function EditorPage() {
  return (
    <AuthGuard>
      <VideoProjectList />
    </AuthGuard>
  );
}
