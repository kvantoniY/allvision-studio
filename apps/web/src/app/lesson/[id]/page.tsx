'use client';

import { AuthGuard } from '@/components/auth/auth-guard';
import { LessonRoom } from '@/components/academy/lesson/LessonRoom';

export default function LessonRoomPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <LessonRoom lessonId={params.id} />
    </AuthGuard>
  );
}
