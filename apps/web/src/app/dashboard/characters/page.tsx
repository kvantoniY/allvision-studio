'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Users } from 'lucide-react';
import type { Character } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { CharacterCard } from '@/components/studio/CharacterCard';
import { toast } from '@/hooks/use-toast';
import { useDeleteCharacterMutation, useListCharactersQuery } from '@/store/api/characters-api';

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'CHARACTER_IN_USE') return 'Невозможно удалить: персонаж используется в активных эпизодах';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось удалить персонажа';
}

export default function CharactersPage() {
  const { data, isLoading } = useListCharactersQuery();
  const [deleteCharacter, deleteState] = useDeleteCharacterMutation();
  const [deleteTarget, setDeleteTarget] = useState<Character | null>(null);
  const characters = data?.items ?? [];

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCharacter(deleteTarget.id).unwrap();
      setDeleteTarget(null);
      toast({ title: 'Персонаж удалён' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Мои персонажи</h1>
            <p className="mt-1 text-slate-400">Ваши AI-актёры для будущих эпизодов.</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/characters/new">
              <Plus className="h-4 w-4" />
              Создать персонажа
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-80 rounded-lg" />
            ))}
          </div>
        ) : characters.length === 0 ? (
          <Card className="border-slate-800 bg-slate-900">
            <CardContent>
              <EmptyState
                size="lg"
                icon={<Users className="h-full w-full" />}
                title="Создайте своего первого персонажа"
                description="Это ваш AI-актёр для будущих эпизодов: семейных поздравлений, историй с питомцами и персональных сцен."
                actions={[{ label: 'Создать персонажа', href: '/dashboard/characters/new' }]}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {characters.map((character) => (
              <CharacterCard key={character.id} character={character} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Удалить персонажа?"
        description="Персонаж будет удалён без восстановления. Если он используется в активном эпизоде, сервер заблокирует удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
