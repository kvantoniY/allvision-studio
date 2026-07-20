'use client';

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Camera,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import {
  CHILD_PHOTO_MAX_SIZE_MB,
  CHILD_PHOTOS_MAX,
  CONSENT_DEFINITIONS,
  type ChildProfileDto,
  type ConsentTypeValue,
} from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useAcceptConsentsMutation,
  useCreateChildMutation,
  useDeleteChildMutation,
  useDeleteChildPhotoMutation,
  useListChildPhotosQuery,
  useListChildrenQuery,
  useUploadChildPhotosMutation,
} from '@/store/api/family-api';

function ageLabel(birthDate: string | null): string | null {
  if (!birthDate) return null;
  const date = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const years = Math.floor((Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000));
  const mod10 = years % 10;
  const mod100 = years % 100;
  const suffix = mod10 === 1 && mod100 !== 11
    ? 'год'
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? 'года'
      : 'лет';
  return `${years} ${suffix}`;
}

function apiErrorMessage(err: unknown): string {
  const data = (err as { data?: { error?: { message?: string }; message?: string } })?.data;
  return data?.error?.message ?? data?.message ?? 'Что-то пошло не так, попробуйте ещё раз';
}

function AddChildForm({ onDone }: { onDone: () => void }) {
  const [createChild, { isLoading }] = useCreateChildMutation();
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createChild({
        name: name.trim(),
        birthDate: birthDate || undefined,
        notes: notes.trim() || undefined,
      }).unwrap();
      toast({ title: 'Профиль ребёнка создан' });
      onDone();
    } catch (err) {
      toast({ title: 'Не удалось создать профиль', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="child-name">Имя или игровой псевдоним</Label>
        <Input
          id="child-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например, Маша или Космонавт Юра"
          maxLength={60}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="child-birth">Дата рождения</Label>
        <Input
          id="child-birth"
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Помогает подбирать темы по возрасту. Можно оставить пустым.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="child-notes">Пожелания и особенности</Label>
        <Textarea
          id="child-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Интересы ребёнка, любимые герои, на что обратить внимание преподавателю"
          rows={3}
          maxLength={1000}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading || !name.trim()}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Создать профиль
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </form>
  );
}

function ConsentsBlock({ child }: { child: ChildProfileDto }) {
  const [acceptConsents, { isLoading }] = useAcceptConsentsMutation();
  const [checked, setChecked] = useState<Set<ConsentTypeValue>>(new Set());

  const activeTypes = useMemo(
    () => new Set(child.consents.filter((c) => !c.revokedAt).map((c) => c.type)),
    [child.consents],
  );
  const pending = CONSENT_DEFINITIONS.filter((def) => !activeTypes.has(def.type));

  if (pending.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm text-accent-foreground">
        <ShieldCheck className="h-5 w-5 shrink-0" />
        Все согласия подтверждены. Можно загружать фотографии и создавать AI-персонажа.
      </div>
    );
  }

  const toggle = (type: ConsentTypeValue) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const submit = async () => {
    try {
      await acceptConsents({ childId: child.id, types: [...checked] }).unwrap();
      setChecked(new Set());
      toast({ title: 'Согласия подтверждены' });
    } catch (err) {
      toast({ title: 'Не удалось сохранить', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  const selectAll = () => setChecked(new Set(pending.map((d) => d.type)));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Согласия на обработку данных ребёнка
          <span className="ml-2 text-muted-foreground">({activeTypes.size} из {CONSENT_DEFINITIONS.length})</span>
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={selectAll}>
          Выбрать все
        </Button>
      </div>
      <div className="space-y-2">
        {pending.map((def) => (
          <label
            key={def.type}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition',
              checked.has(def.type) ? 'border-primary bg-accent/60' : 'border-border hover:border-primary/40',
            )}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[hsl(24_94%_50%)]"
              checked={checked.has(def.type)}
              onChange={() => toggle(def.type)}
            />
            <span>
              <span className="block text-sm font-medium">{def.title}</span>
              <span className="block text-xs text-muted-foreground">{def.description}</span>
            </span>
          </label>
        ))}
      </div>
      <Button type="button" onClick={submit} disabled={isLoading || checked.size === 0}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Подтвердить выбранные
      </Button>
    </div>
  );
}

function PhotosBlock({ child }: { child: ChildProfileDto }) {
  const { data, isLoading } = useListChildPhotosQuery(child.id);
  const [uploadPhotos, { isLoading: uploading }] = useUploadChildPhotosMutation();
  const [deletePhoto] = useDeleteChildPhotoMutation();

  const photos = data?.items ?? [];

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;
    const tooBig = files.find((f) => f.size > CHILD_PHOTO_MAX_SIZE_MB * 1024 * 1024);
    if (tooBig) {
      toast({
        title: 'Файл слишком большой',
        description: `«${tooBig.name}» больше ${CHILD_PHOTO_MAX_SIZE_MB} МБ`,
        variant: 'destructive',
      });
      return;
    }
    const form = new FormData();
    files.forEach((file) => form.append('photos', file));
    try {
      await uploadPhotos({ childId: child.id, form }).unwrap();
      toast({ title: `Загружено фотографий: ${files.length}` });
    } catch (err) {
      toast({ title: 'Не удалось загрузить', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  if (!child.photoConsentsComplete) {
    return (
      <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
        Загрузка фотографий откроется после подтверждения всех согласий выше.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          Фотографии для AI-персонажа
          <span className="ml-2 text-muted-foreground">({photos.length} из {CHILD_PHOTOS_MAX})</span>
        </p>
        <label className="inline-flex">
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onFiles} />
          <span
            className={cn(
              'inline-flex cursor-pointer items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90',
              (uploading || photos.length >= CHILD_PHOTOS_MAX) && 'pointer-events-none opacity-50',
            )}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Загрузить
          </span>
        </label>
      </div>
      <p className="text-xs text-muted-foreground">
        JPG, PNG или WebP, до {CHILD_PHOTO_MAX_SIZE_MB} МБ. Лучше всего: чёткое лицо, разные ракурсы, хорошее
        освещение. Фотографии хранятся в закрытом хранилище и не публикуются.
      </p>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет фотографий.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              {/* Авторизованная раздача через API (cookie), не публичный /static */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.fileUrl} alt={photo.fileName} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Удалить фотографию"
                onClick={async () => {
                  try {
                    await deletePhoto({ childId: child.id, photoId: photo.id }).unwrap();
                  } catch (err) {
                    toast({ title: 'Не удалось удалить', description: apiErrorMessage(err), variant: 'destructive' });
                  }
                }}
                className="absolute right-1.5 top-1.5 hidden h-7 w-7 items-center justify-center rounded-full bg-white/90 text-destructive shadow-sm transition hover:bg-white group-hover:flex"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChildCard({ child }: { child: ChildProfileDto }) {
  const [open, setOpen] = useState(false);
  const [deleteChild, { isLoading: deleting }] = useDeleteChildMutation();
  const age = ageLabel(child.birthDate);

  const onDelete = async () => {
    const confirmed = window.confirm(
      `Удалить профиль «${child.name}»? Будут удалены все фотографии и материалы ребёнка. Это действие необратимо.`,
    );
    if (!confirmed) return;
    try {
      await deleteChild(child.id).unwrap();
      toast({ title: 'Профиль удалён', description: 'Все материалы ребёнка удалены.' });
    } catch (err) {
      toast({ title: 'Не удалось удалить', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Card className="animate-academy-in overflow-hidden border-border bg-card shadow-sm">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/60"
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-foreground">
            {child.name[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{child.name}</p>
            <p className="text-sm text-muted-foreground">
              {age ? `${age} · ` : ''}Уровень {child.level} · {child.xp} XP
            </p>
          </div>
          <div className="flex items-center gap-2">
            {child.photoConsentsComplete ? (
              <Badge className="hidden gap-1 bg-accent text-accent-foreground hover:bg-accent sm:inline-flex">
                <CheckCircle2 className="h-3.5 w-3.5" /> Согласия
              </Badge>
            ) : (
              <Badge variant="outline" className="hidden border-primary/50 text-primary sm:inline-flex">
                Нужны согласия
              </Badge>
            )}
            <Badge variant="outline" className="hidden sm:inline-flex">
              <Camera className="mr-1 h-3.5 w-3.5" /> {child.photosCount}
            </Badge>
            <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', open && 'rotate-180')} />
          </div>
        </button>
        {open && (
          <div className="space-y-6 border-t border-border px-5 py-5">
            <ConsentsBlock child={child} />
            <PhotosBlock child={child} />
            <div className="flex justify-end border-t border-border pt-4">
              <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={deleting} className="text-destructive hover:text-destructive">
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Удалить профиль и все материалы
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FamilyPage() {
  const { data, isLoading } = useListChildrenQuery();
  const [adding, setAdding] = useState(false);
  const children = data?.items ?? [];

  return (
    <AuthGuard>
      <div className="academy-theme min-h-screen">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="mb-8">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" /> Allvision Academy
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Семья</h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              Профили детей, согласия и фотографии для создания AI-персонажа. Ребёнок станет главным героем
              своих уроков-приключений.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {children.length === 0 && !adding && (
                <Card className="border-dashed border-border bg-card">
                  <CardContent className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                      <Users className="h-7 w-7" />
                    </div>
                    <p className="font-semibold">Добавьте первого ребёнка</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Создайте профиль, подтвердите согласия и загрузите фотографии — дальше мы создадим
                      персонажа для уроков.
                    </p>
                  </CardContent>
                </Card>
              )}

              {children.map((child) => (
                <ChildCard key={child.id} child={child} />
              ))}

              {adding ? (
                <Card className="border-border bg-card shadow-sm">
                  <CardContent className="px-5 py-5">
                    <p className="mb-4 font-semibold">Новый профиль ребёнка</p>
                    <AddChildForm onDone={() => setAdding(false)} />
                  </CardContent>
                </Card>
              ) : (
                <Button type="button" onClick={() => setAdding(true)} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> Добавить ребёнка
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
