'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CharacterGender } from '@allvision/shared';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, RefreshCw, Save, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiImageUploader, type SelectedImage } from '@/components/ui/multi-image-uploader';
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
  useReplaceCharacterReferenceImagesMutation,
  useStartCharacterCheckMutation,
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
  if (code === 'CHARACTER_BUSY') return 'Проверка уже идёт. Дождитесь завершения';
  if (code === 'FILE_REQUIRED') return 'Добавьте хотя бы одно фото';
  if (code === 'QUEUE_UNAVAILABLE') return 'Проверка фото временно недоступна';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function CharacterEditPage({ params }: PageProps) {
  const router = useRouter();
  const [polling, setPolling] = useState(false);
  const { data, isLoading } = useGetCharacterQuery(params.id, {
    pollingInterval: polling ? 2000 : 0,
  });
  const [updateCharacter, updateState] = useUpdateCharacterMutation();
  const [deleteCharacter, deleteState] = useDeleteCharacterMutation();
  const [replaceReferences, replaceState] = useReplaceCharacterReferenceImagesMutation();
  const [startCheck, startCheckState] = useStartCharacterCheckMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceImages, setReplaceImages] = useState<SelectedImage[]>([]);
  const [replacePrimaryId, setReplacePrimaryId] = useState<string | null>(null);

  const character = data?.character;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gender, setGender] = useState<CharacterGender | ''>('');
  const [ageGroup, setAgeGroup] = useState('');
  const [primaryImageId, setPrimaryImageId] = useState(0);

  useEffect(() => {
    setPolling(character?.status === 'PROCESSING');
  }, [character?.status]);

  useEffect(() => {
    if (!character) return;
    setName(character.name);
    setDescription(character.description ?? '');
    setGender(character.gender ?? '');
    setAgeGroup(character.ageGroup ?? '');
    setPrimaryImageId(character.primaryImageId);
  }, [character]);

  const orderedReplaceImages = useMemo(() => {
    if (!replacePrimaryId) return replaceImages;
    const primary = replaceImages.find((image) => image.id === replacePrimaryId);
    if (!primary) return replaceImages;
    return [primary, ...replaceImages.filter((image) => image.id !== replacePrimaryId)];
  }, [replaceImages, replacePrimaryId]);

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

  const openReplace = () => {
    setReplaceImages([]);
    setReplacePrimaryId(null);
    setReplaceOpen(true);
  };

  const submitReplace = async () => {
    if (!character) return;
    if (replaceImages.length === 0) {
      toast({ title: 'Добавьте хотя бы одно фото', variant: 'destructive' });
      return;
    }

    const form = new FormData();
    orderedReplaceImages.forEach((image) => form.append('images', image.file));
    form.append('primaryImageId', '0');

    try {
      await replaceReferences({ id: character.id, body: form }).unwrap();
      setReplaceOpen(false);
      setPolling(true);
      toast({ title: 'Фото заменены. Запущена проверка' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const runCheck = async () => {
    if (!character) return;
    try {
      await startCheck(character.id).unwrap();
      setPolling(true);
      toast({ title: 'Проверка запущена' });
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

  const canReplace = character.status === 'READY' || character.status === 'REJECTED';

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
          <div className="flex flex-wrap gap-2">
            {canReplace && (
              <Button type="button" variant="outline" onClick={openReplace}>
                <RefreshCw className="h-4 w-4" />
                Заменить фото
              </Button>
            )}
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Удалить персонажа
            </Button>
          </div>
        </div>

        {character.status === 'PROCESSING' && (
          <Alert className="border-sky-500/40 bg-sky-500/10 text-sky-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Проверяем фото</AlertTitle>
            <AlertDescription>Это займёт несколько секунд.</AlertDescription>
          </Alert>
        )}

        {character.status === 'READY' && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-100">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Персонаж готов</AlertTitle>
            <AlertDescription>Его можно использовать в будущих эпизодах.</AlertDescription>
          </Alert>
        )}

        {character.status === 'REJECTED' && (
          <Alert variant="destructive" className="border-red-500/40 bg-red-500/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Фото не прошли проверку</AlertTitle>
            <AlertDescription>
              К сожалению, фото не прошли проверку. Загрузите другие изображения.
              {character.isPaid ? ' Токены возвращены на баланс.' : ''}
            </AlertDescription>
          </Alert>
        )}

        {character.status === 'DRAFT' && (
          <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Проверка ещё не запускалась</AlertTitle>
            <AlertDescription>
              <Button
                type="button"
                size="sm"
                className="mt-3"
                onClick={runCheck}
                disabled={startCheckState.isLoading}
              >
                Запустить проверку
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <form onSubmit={save}>
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Имя</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="gender">Пол</Label>
                    <select
                      id="gender"
                      value={gender}
                      onChange={(event) => setGender(event.target.value as CharacterGender | '')}
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
                    <Input id="ageGroup" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Описание</Label>
                  <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} />
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
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-slate-200">Reference-фото</div>
                {canReplace && (
                  <Button type="button" size="sm" variant="outline" onClick={openReplace}>
                    Заменить
                  </Button>
                )}
              </div>
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

      {replaceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-lg border border-slate-800 bg-slate-950 p-6 shadow-xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Заменить фото</h2>
                <p className="mt-1 text-sm text-slate-400">Новый набор снова пройдёт проверку.</p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setReplaceOpen(false)} disabled={replaceState.isLoading}>
                Закрыть
              </Button>
            </div>
            <MultiImageUploader
              value={replaceImages}
              onChange={(nextImages) => {
                setReplaceImages(nextImages);
                if (!replacePrimaryId && nextImages[0]) setReplacePrimaryId(nextImages[0].id);
              }}
              maxFiles={5}
              primaryId={replacePrimaryId}
              onPrimaryChange={setReplacePrimaryId}
              disabled={replaceState.isLoading}
              hint="Загрузите 1-5 новых reference-фото. Главное фото будет первым в наборе."
            />
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setReplaceOpen(false)} disabled={replaceState.isLoading}>
                Отмена
              </Button>
              <Button type="button" onClick={submitReplace} disabled={replaceState.isLoading || replaceImages.length === 0}>
                Заменить фото
              </Button>
            </div>
          </div>
        </div>
      )}

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
