'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { VideoEditor } from '@/components/editor/VideoEditor';

// В Next 14 params приходит обычным объектом, а не промисом: разворачивать его
// через use() нельзя — страница падает в 500 уже на рендере.
export default function EditorProjectPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <VideoEditor id={params.id} />
    </AuthGuard>
  );
}
