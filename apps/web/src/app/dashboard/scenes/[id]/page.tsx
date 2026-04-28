'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useDeleteSceneMutation, useGetSceneQuery, useUpdateSceneMutation } from '@/store/api/scenes-api';

type PageProps = {
  params: { id: string };
};

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'SCENE_IN_USE') return 'Невозможно удалить: сцена используется в активных эпизодах';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function SceneEditPage({ params }: PageProps) {
  const router = useRouter();
  const { data, isLoading } = useGetSceneQuery(params.id);
  const [updateScene, updateState] = useUpdateSceneMutation();
  const [deleteScene, deleteState] = useDeleteSceneMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const scene = data?.scene;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('home');

  useEffect(() => {
    if (!scene) return;
    setName(scene.name);
    setDescription(scene.description);
    setCategory(scene.category ?? 'home');
  }, [scene]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!scene) return;
    try {
      await updateScene({
        id: scene.id,
        body: { name: name.trim(), description: description.trim(), category },
      }).unwrap();
      toast({ title: 'Сцена сохранена' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!scene) return;
    try {
      await deleteScene(scene.id).unwrap();
      setDeleteOpen(false);
      toast({ title: 'Сцена удалена' });
      router.push('/dashboard/scenes');
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

  if (!scene) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/scenes">
            <ArrowLeft className="h-4 w-4" />
            К сценам
          </Link>
        </Button>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="p-8 text-center text-slate-400">Сцена не найдена.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/scenes">
            <ArrowLeft className="h-4 w-4" />
            К сценам
          </Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{scene.name}</h1>
            <p className="mt-1 text-slate-400">Редактирование описания локации.</p>
          </div>
          <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4" />
            Удалить сцену
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <form onSubmit={save}>
            <Card className="border-slate-800 bg-slate-900">
              <CardContent className="space-y-5 p-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Название</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Категория</Label>
                  <select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
                  >
                    <option value="home">Дом</option>
                    <option value="outdoor">Улица</option>
                    <option value="studio">Студия</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Описание</Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={7} required />
                  <p className="text-xs text-slate-500">Замена reference-фото будет доступна в следующем обновлении.</p>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={updateState.isLoading || !name.trim() || !description.trim()}>
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
                {scene.referenceImages.map((image, index) => (
                  <div key={image} className="relative aspect-square overflow-hidden rounded-md border border-slate-800 bg-slate-800">
                    <img src={image} alt="" className="h-full w-full object-cover" />
                    {index === 0 && (
                      <span className="absolute bottom-1 left-1 rounded bg-violet-600 px-2 py-1 text-[11px] text-white">
                        Главное
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить сцену?"
        description="Сцена будет удалена без восстановления. Если она используется в активном эпизоде, сервер заблокирует удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
