'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CharacterGender, CharacterType } from '@allvision/shared';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiImageUploader, type SelectedImage } from '@/components/ui/multi-image-uploader';
import { Textarea } from '@/components/ui/textarea';
import { CHARACTER_TYPE_LABEL, CharacterTypeIcon } from '@/components/studio/v3-labels';
import { toast } from '@/hooks/use-toast';
import { useCreateCharacterMutation } from '@/store/api/characters-api';
import { cn } from '@/lib/utils';

const characterTypes: CharacterType[] = ['HUMAN', 'PET', 'GROUP', 'MASCOT'];

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'CONSENT_REQUIRED') return 'Подтвердите согласие на использование изображения';
  if (code === 'FILE_REQUIRED') return 'Добавьте хотя бы одно фото';
  if (code === 'UNSUPPORTED_FORMAT') return 'Поддерживаются только JPEG, PNG и WebP';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось создать персонажа';
}

export default function NewCharacterPage() {
  const router = useRouter();
  const [createCharacter, createState] = useCreateCharacterMutation();
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CharacterType>('HUMAN');
  const [gender, setGender] = useState<CharacterGender | ''>('');
  const [ageGroup, setAgeGroup] = useState('');
  const [description, setDescription] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  const orderedImages = useMemo(() => {
    if (!primaryId) return images;
    const primary = images.find((image) => image.id === primaryId);
    if (!primary) return images;
    return [primary, ...images.filter((image) => image.id !== primaryId)];
  }, [images, primaryId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (images.length === 0) {
      toast({ title: 'Добавьте хотя бы одно фото', variant: 'destructive' });
      return;
    }
    if (!consentGiven) {
      toast({ title: 'Подтвердите согласие на использование изображения', variant: 'destructive' });
      return;
    }

    const form = new FormData();
    orderedImages.forEach((image) => form.append('images', image.file));
    form.append('name', name.trim());
    form.append('type', type);
    if (type === 'HUMAN' && gender) form.append('gender', gender);
    if (ageGroup.trim()) form.append('ageGroup', ageGroup.trim());
    if (description.trim()) form.append('description', description.trim());
    form.append('consentGiven', String(consentGiven));

    try {
      await createCharacter(form).unwrap();
      toast({ title: 'Персонаж создан' });
      router.push('/dashboard/characters');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/characters">
          <ArrowLeft className="h-4 w-4" />
          К персонажам
        </Link>
      </Button>

      <div>
        <h1 className="text-3xl font-bold">Создать персонажа</h1>
        <p className="mt-1 text-slate-400">Простая форма для V3-каталога. Мастер с проверкой появится в следующем этапе.</p>
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
                maxFiles={5}
                primaryId={primaryId}
                onPrimaryChange={setPrimaryId}
                disabled={createState.isLoading}
              />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ageGroup">Возрастная группа</Label>
                <Input id="ageGroup" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} placeholder="child, adult, senior" />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Тип</Label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {characterTypes.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setType(item)}
                    className={cn(
                      'flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 text-left text-sm transition',
                      type === item && 'border-violet-400 bg-violet-500/10 text-white',
                    )}
                  >
                    <CharacterTypeIcon type={item} className="h-5 w-5 text-violet-300" />
                    {CHARACTER_TYPE_LABEL[item]}
                  </button>
                ))}
              </div>
            </div>

            {type === 'HUMAN' && (
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
            )}

            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </div>

            <label className="flex gap-3 rounded-md border border-violet-500/30 bg-violet-500/10 p-4 text-sm leading-6 text-slate-200">
              <input
                type="checkbox"
                checked={consentGiven}
                onChange={(e) => setConsentGiven(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0"
              />
              <span>
                Я подтверждаю, что человек/животное на фото — это я, мой родственник, мой питомец, или у меня есть письменное согласие на использование изображения.
              </span>
            </label>

            <div className="flex justify-end">
              <Button type="submit" disabled={createState.isLoading || !consentGiven || images.length === 0 || !name.trim()}>
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
