'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ImagePlus, Plus } from 'lucide-react';
import type { Scene } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { SceneCard } from '@/components/studio/SceneCard';
import { toast } from '@/hooks/use-toast';
import { useDeleteSceneMutation, useListScenesQuery } from '@/store/api/scenes-api';

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'SCENE_IN_USE') return 'Невозможно удалить: сцена используется в активных эпизодах';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось удалить сцену';
}

export default function ScenesPage() {
  const { data, isLoading } = useListScenesQuery();
  const [deleteScene, deleteState] = useDeleteSceneMutation();
  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null);
  const scenes = data?.items ?? [];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteScene(deleteTarget.id).unwrap();
      setDeleteTarget(null);
      toast({ title: 'Сцена удалена' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Мои сцены</h1>
            <p className="mt-1 text-slate-400">Локации, где будут разворачиваться ваши истории.</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/scenes/new">
              <Plus className="h-4 w-4" />
              Создать сцену
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-80 rounded-lg" />
            ))}
          </div>
        ) : scenes.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900">
            <CardContent>
              <EmptyState
                size="lg"
                icon={<ImagePlus className="h-full w-full" />}
                title="Создайте первую сцену"
                description="Опишите дом, студию, двор или любое место, где ваши персонажи будут выглядеть естественно."
                actions={[{ label: 'Создать сцену', href: '/dashboard/scenes/new' }]}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {scenes.map((scene) => (
              <SceneCard key={scene.id} scene={scene} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Удалить сцену?"
        description="Сцена будет удалена без восстановления. Активные эпизоды заблокируют удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
