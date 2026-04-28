'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CharacterGender } from '@allvision/shared';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  CHARACTER_STATUS_CLASS,
  CHARACTER_STATUS_LABEL,
  CHARACTER_TYPE_LABEL,
  CharacterTypeIcon,
} from '@/components/studio/v3-labels';
import { toast } from '@/hooks/use-toast';
import {
  useDeleteCharacterMutation,
  useGetCharacterQuery,
  useUpdateCharacterMutation,
} from '@/store/api/characters-api';
import { cn } from '@/lib/utils';

type PageProps = {
  params: { id: string };
};

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'CHARACTER_IN_USE') return 'Невозможно удалить: персонаж используется в активных эпизодах';
  if (code === 'INVALID_PRIMARY_IMAGE_ID') return 'Выберите существующее главное фото';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function CharacterEditPage({ params }: PageProps) {
  const router = useRouter();
  const { data, isLoading } = useGetCharacterQuery(params.id);
  const [updateCharacter, updateState] = useUpdateCharacterMutation();
  const [deleteCharacter, deleteState] = useDeleteCharacterMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const character = data?.character;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState<CharacterGender | ''>('');
  const [ageGroup, setAgeGroup] = useState('');
  const [primaryImageId, setPrimaryImageId] = useState(0);

  useEffect(() => {
    if (!character) return;
    setName(character.name);
    setDescription(character.description ?? '');
    setGender(character.gender ?? '');
    setAgeGroup(character.ageGroup ?? '');
    setPrimaryImageId(character.primaryImageId);
  }, [character]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!character) return;
    try {
      await updateCharacter({
        id: character.id,
        body: {
          name: name.trim(),
          description: description.trim() || undefined,
          gender: gender || undefined,
          ageGroup: ageGroup.trim() || undefined,
          primaryImageId,
        },
      }).unwrap();
      toast({ title: 'Персонаж сохранён' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!character) return;
    try {
      await deleteCharacter(character.id).unwrap();
      setDeleteOpen(false);
      toast({ title: 'Персонаж удалён' });
      router.push('/dashboard/characters');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  if (!character) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/characters">
            <ArrowLeft className="h-4 w-4" />
            К персонажам
          </Link>
        </Button>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-8 text-center text-slate-400">Персонаж не найден.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/characters">
            <ArrowLeft className="h-4 w-4" />
            К персонажам
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{character.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={CHARACTER_STATUS_CLASS[character.status]}>{CHARACTER_STATUS_LABEL[character.status]}</Badge>
              <span className="flex items-center gap-2 text-sm text-slate-400">
                <CharacterTypeIcon type={character.type} className="h-4 w-4" />
                {CHARACTER_TYPE_LABEL[character.type]}
              </span>
            </div>
          </div>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Удалить персонажа
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <form onSubmit={save}>
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Имя</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gender">Пол</Label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(e) => setGender(e.target.value as CharacterGender | '')}
                      className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                    >
                      <option value="">Не указано</option>
                      <option value="MALE">Мужской</option>
                      <option value="FEMALE">Женский</option>
                      <option value="OTHER">Другое</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ageGroup">Возрастная группа</Label>
                    <Input id="ageGroup" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Описание</Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
                </div>
                <div className="rounded-md border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  Замена reference-фото будет доступна в следующем обновлении.
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={updateState.isLoading || !name.trim()}>
                    <Save className="h-4 w-4" />
                    Сохранить
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          <Card className="border-slate-800 bg-slate-900">
            <CardContent className="space-y-4 p-4">
              <div className="text-sm font-medium text-slate-200">Reference-фото</div>
              <div className="grid grid-cols-2 gap-3">
                {character.referenceImages.map((image, index) => (
                  <button
                    type="button"
                    key={image}
                    onClick={() => setPrimaryImageId(index)}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded-md border bg-slate-800',
                      primaryImageId === index ? 'border-violet-400' : 'border-slate-800',
                    )}
                  >
                    <img src={image} alt="" className="h-full w-full object-cover" />
                    {primaryImageId === index && (
                      <span className="absolute bottom-1 left-1 rounded bg-violet-600 px-2 py-1 text-[11px] text-white">
                        Главное
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить персонажа?"
        description="Персонаж будет удалён без восстановления. Если он используется в активном эпизоде, сервер заблокирует удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
