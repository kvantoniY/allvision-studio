'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiImageUploader, type SelectedImage } from '@/components/ui/multi-image-uploader';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useCreateSceneMutation } from '@/store/api/scenes-api';

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'FILE_REQUIRED') return 'Добавьте хотя бы одно фото сцены';
  if (code === 'UNSUPPORTED_FORMAT') return 'Поддерживаются только JPEG, PNG и WebP';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось создать сцену';
}

export default function NewScenePage() {
  const router = useRouter();
  const [createScene, createState] = useCreateSceneMutation();
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('home');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (images.length === 0) {
      toast({ title: 'Добавьте хотя бы одно фото сцены', variant: 'destructive' });
      return;
    }

    const ordered = primaryId
      ? [...images.filter((image) => image.id === primaryId), ...images.filter((image) => image.id !== primaryId)]
      : images;

    const form = new FormData();
    ordered.forEach((image) => form.append('images', image.file));
    form.append('name', name.trim());
    form.append('description', description.trim());
    if (category) form.append('category', category);

    try {
      await createScene(form).unwrap();
      toast({ title: 'Сцена создана' });
      router.push('/dashboard/scenes');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/scenes">
          <ArrowLeft className="h-4 w-4" />
          К сценам
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold">Создать сцену</h1>
        <p className="mt-1 text-slate-400">Добавьте опорные фото и описание локации для будущих эпизодов.</p>
      </div>

      <form onSubmit={submit}>
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="space-y-6 p-6">
            <div className="space-y-2">
              <Label>Reference-фото</Label>
              <MultiImageUploader
                value={images}
                onChange={(next) => {
                  setImages(next);
                  if (!primaryId && next[0]) setPrimaryId(next[0].id);
                }}
                maxFiles={3}
                primaryId={primaryId}
                onPrimaryChange={setPrimaryId}
                disabled={createState.isLoading}
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required />
              <p className="text-xs text-slate-500">Опишите важные детали: свет, мебель, цвета, время суток, настроение.</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={createState.isLoading || images.length === 0 || !name.trim() || !description.trim()}>
                <CheckCircle2 className="h-4 w-4" />
                Создать
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
