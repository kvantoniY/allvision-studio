'use client';

import { AcademyMaterialsWorkspace } from '@/components/academy/materials-workspace';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function TeacherLibraryPage() {
  return (
    <AuthGuard>
      <AcademyMaterialsWorkspace />
    </AuthGuard>
  );
}
