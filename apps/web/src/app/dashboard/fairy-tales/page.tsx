'use client';

import { BookOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/dashboard/EmptyState';

export default function FairyTalesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Мои сказки</h1>
        <p className="mt-1 text-sm text-slate-400">
          AI-сценарии и видео-сказки, где главный герой — ваш ребёнок.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardContent className="p-6">
          <EmptyState
            size="lg"
            icon={<BookOpen className="h-full w-full" />}
            title="Сказка ждёт своего автора — вас"
            description="Создайте персональную сказку, где главный герой — ваш ребёнок"
            actions={[{ label: 'Создать сказку', href: '/services/fairy-tale' }]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
