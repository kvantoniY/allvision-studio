'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  BookOpen,
  Camera,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  GraduationCap,
  Gamepad2,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react';
import {
  CHILD_PHOTO_MAX_SIZE_MB,
  CHILD_PHOTOS_MAX,
  CONSENT_CURRENT_VERSION,
  CONSENT_DEFINITIONS,
  LESSON_STATUS_LABELS,
  TOPIC_PROGRESS_LABELS,
  type ChildProfileDto,
  type ConsentTypeValue,
  type EnrollmentProgressDto,
  type LessonStatusValue,
} from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { ParentOnboarding } from '@/components/academy/ParentOnboarding';
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
  useApproveCharacterMutation,
  useCreateChildMutation,
  useDeleteCharacterRefMutation,
  useDeleteChildMutation,
  useDeleteChildPhotoMutation,
  useEnrollChildMutation,
  useGenerateCharacterMutation,
  useGetCharacterQuery,
  useGetChildLessonsQuery,
  useGetChildProgressQuery,
  useListChildPhotosQuery,
  useListChildrenQuery,
  useListCoursesQuery,
  useRegenerateCharacterRefMutation,
  useUnenrollChildMutation,
  useUploadChildPhotosMutation,
} from '@/store/api/family-api';
import { useListLessonReportsQuery, useMarkReportReadMutation } from '@/store/api/academy-operations-api';

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
    () => new Set(child.consents.filter((c) => !c.revokedAt && c.version === CONSENT_CURRENT_VERSION).map((c) => c.type)),
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
      <p className="text-xs leading-5 text-muted-foreground">
        Редакция {CONSENT_CURRENT_VERSION}. Подтверждая пункт, вы заявляете, что являетесь родителем или законным
        представителем ребёнка. Точный текст каждого принятого согласия сохраняется в журнале. Подробнее — в{' '}
        <Link href="/privacy" target="_blank" className="underline hover:text-foreground">политике конфиденциальности</Link>.
      </p>
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

const CHARACTER_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Черновик',
  GENERATING: 'Генерируется…',
  READY: 'Готов к утверждению',
  APPROVED: 'Утверждён',
  FAILED: 'Ошибка',
};

function CharacterBlock({ child }: { child: ChildProfileDto }) {
  const { data, isLoading } = useGetCharacterQuery(child.id, {
    pollingInterval: 3000,
    skipPollingIfUnfocused: true,
  });
  const [generate, { isLoading: generating }] = useGenerateCharacterMutation();
  const [approve, { isLoading: approving }] = useApproveCharacterMutation();
  const [deleteRef] = useDeleteCharacterRefMutation();
  const [regenerateRef] = useRegenerateCharacterRefMutation();

  const profile = data?.profile ?? null;
  const canStart = child.photoConsentsComplete && child.photosCount > 0;

  const onGenerate = async () => {
    try {
      await generate(child.id).unwrap();
      toast({ title: 'Генерация персонажа запущена', description: 'Обычно занимает несколько минут.' });
    } catch (err) {
      toast({ title: 'Не удалось запустить', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">
          AI-персонаж
          {profile && (
            <Badge
              variant="outline"
              className={cn(
                'ml-2 align-middle',
                profile.status === 'APPROVED' && 'border-primary/50 bg-accent text-accent-foreground',
                profile.status === 'FAILED' && 'border-destructive/50 text-destructive',
              )}
            >
              {CHARACTER_STATUS_LABEL[profile.status] ?? profile.status}
            </Badge>
          )}
        </p>
        <div className="flex gap-2">
          {profile?.status === 'READY' && (
            <Button
              type="button"
              size="sm"
              disabled={approving}
              onClick={async () => {
                try {
                  await approve(child.id).unwrap();
                  toast({ title: 'Персонаж утверждён' });
                } catch (err) {
                  toast({ title: 'Не удалось утвердить', description: apiErrorMessage(err), variant: 'destructive' });
                }
              }}
            >
              {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Утвердить
            </Button>
          )}
          {(!profile || ['DRAFT', 'READY', 'APPROVED', 'FAILED'].includes(profile.status)) && (
            <Button
              type="button"
              size="sm"
              variant={profile?.references.length ? 'outline' : 'default'}
              disabled={generating || !canStart}
              onClick={onGenerate}
            >
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {profile?.references.length ? 'Создать заново' : 'Создать персонажа'}
            </Button>
          )}
        </div>
      </div>

      {!canStart && (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          Для создания персонажа подтвердите все согласия и загрузите хотя бы одну фотографию.
        </p>
      )}

      {profile?.status === 'GENERATING' && (
        <div className="space-y-2 rounded-xl bg-accent/60 px-4 py-3">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 font-medium text-accent-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Создаём эталонный набор…
            </span>
            <span className="text-muted-foreground">{profile.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${profile.progress}%` }} />
          </div>
        </div>
      )}

      {profile?.status === 'FAILED' && profile.errorMessage && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {profile.errorMessage}
        </p>
      )}

      {profile && profile.references.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {profile.references.map((ref) => (
            <figure key={ref.id} className="group relative overflow-hidden rounded-xl border border-border bg-muted">
              <div className="aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ref.fileUrl} alt={ref.label} className="h-full w-full object-cover" />
              </div>
              <figcaption className="truncate px-2 py-1.5 text-center text-xs text-muted-foreground">
                {ref.label}
              </figcaption>
              {profile.status !== 'GENERATING' && (
                <div className="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
                  <button
                    type="button"
                    aria-label="Перегенерировать"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-foreground shadow-sm transition hover:bg-white"
                    onClick={async () => {
                      try {
                        await regenerateRef({ childId: child.id, refId: ref.id }).unwrap();
                        toast({ title: `Перегенерация: ${ref.label}` });
                      } catch (err) {
                        toast({ title: 'Не удалось запустить', description: apiErrorMessage(err), variant: 'destructive' });
                      }
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить референс"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-destructive shadow-sm transition hover:bg-white"
                    onClick={async () => {
                      try {
                        await deleteRef({ childId: child.id, refId: ref.id }).unwrap();
                      } catch (err) {
                        toast({ title: 'Не удалось удалить', description: apiErrorMessage(err), variant: 'destructive' });
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </figure>
          ))}
        </div>
      )}

      {canStart && !profile && (
        <p className="text-xs text-muted-foreground">
          Из фотографий мы создадим эталонный набор: портрет, профиль, полный рост, эмоции.
          Он станет основой всех иллюстраций и кат-сцен с ребёнком.
        </p>
      )}
    </div>
  );
}

const TOPIC_STATUS_DOT: Record<string, string> = {
  COMPLETED: 'bg-primary',
  IN_PROGRESS: 'bg-primary/60',
  RECOMMENDED: 'bg-primary/60 ring-2 ring-primary/30',
  LOCKED: 'bg-muted-foreground/30',
};

function EnrollmentCard({ childId, enrollment }: { childId: string; enrollment: EnrollmentProgressDto }) {
  const [unenroll] = useUnenrollChildMutation();
  const pct = enrollment.totalTopics > 0 ? Math.round((enrollment.completedTopics / enrollment.totalTopics) * 100) : 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{enrollment.courseTitle}</p>
          <p className="text-xs text-muted-foreground">{enrollment.subjectTitle}</p>
        </div>
        <button
          type="button"
          aria-label="Отписать от курса"
          className="text-muted-foreground hover:text-destructive"
          onClick={async () => {
            if (!window.confirm(`Отписать от курса «${enrollment.courseTitle}»?`)) return;
            await unenroll({ childId, enrollmentId: enrollment.enrollmentId }).unwrap().catch(() => undefined);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>Пройдено {enrollment.completedTopics} из {enrollment.totalTopics}</span>
        <span>{pct}%</span>
      </div>
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="space-y-1">
        {enrollment.topics.map((t) => (
          <div key={t.topicId} className="flex items-center gap-2 text-sm">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', TOPIC_STATUS_DOT[t.status] ?? 'bg-muted')} />
            <span className={cn('min-w-0 flex-1 truncate', t.status === 'COMPLETED' ? 'text-muted-foreground line-through' : '')}>
              {t.title}
            </span>
            {t.isNextRecommended && (
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                Следующая
              </span>
            )}
            {!t.isNextRecommended && t.status !== 'LOCKED' && (
              <span className="shrink-0 text-xs text-muted-foreground">{TOPIC_PROGRESS_LABELS[t.status]}</span>
            )}
          </div>
        ))}
        {enrollment.topics.length === 0 && (
          <p className="text-sm text-muted-foreground">В курсе пока нет тем.</p>
        )}
      </div>
    </div>
  );
}

function ProgressBlock({ child }: { child: ChildProfileDto }) {
  const { data, isLoading } = useGetChildProgressQuery(child.id);
  const courses = useListCoursesQuery();
  const [enroll, { isLoading: enrolling }] = useEnrollChildMutation();
  const [enrollOpen, setEnrollOpen] = useState(false);

  const progress = data?.progress;
  const enrolledCourseIds = new Set(progress?.enrollments.map((e) => e.courseId) ?? []);

  const doEnroll = async (courseId: string) => {
    try {
      await enroll({ childId: child.id, courseId }).unwrap();
      setEnrollOpen(false);
      toast({ title: 'Ребёнок записан на курс' });
    } catch (err) {
      toast({ title: 'Не удалось записать', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <div className="h-16 animate-pulse rounded-xl bg-muted" />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Программы и прогресс</p>
        <Button type="button" size="sm" variant="outline" onClick={() => setEnrollOpen((v) => !v)}>
          <Plus className="mr-1.5 h-4 w-4" /> Записать на курс
        </Button>
      </div>

      {enrollOpen && (
        <div className="rounded-xl border border-border bg-card p-3">
          {courses.isLoading ? (
            <p className="text-sm text-muted-foreground">Загрузка курсов…</p>
          ) : (courses.data?.subjects.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Курсы ещё не заведены методистом.</p>
          ) : (
            <div className="space-y-3">
              {courses.data!.subjects.map((s) => (
                <div key={s.id}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.title}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.courses.map((c) => {
                      const already = enrolledCourseIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={already || enrolling}
                          onClick={() => doEnroll(c.id)}
                          className={cn(
                            'rounded-full border px-3 py-1.5 text-sm transition',
                            already
                              ? 'cursor-default border-border bg-muted text-muted-foreground'
                              : 'border-primary/40 text-primary hover:bg-accent',
                          )}
                        >
                          {c.title}{c.level ? ` · ${c.level}` : ''}{already ? ' ✓' : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {progress && progress.enrollments.length > 0 ? (
        <div className="space-y-3">
          {progress.enrollments.map((e) => (
            <EnrollmentCard key={e.enrollmentId} childId={child.id} enrollment={e} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
          <BookOpen className="mr-1.5 inline h-4 w-4 align-text-bottom" />
          Ребёнок пока не записан на курсы.
        </p>
      )}

      {progress && progress.skills.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium">Освоенные навыки</p>
          <div className="flex flex-wrap gap-1.5">
            {progress.skills.map((sk) => (
              <span key={sk.skillId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs">
                {sk.title}
                <span className="text-muted-foreground">· {sk.levelLabel}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <LessonHistoryBlock childId={child.id} />
    </div>
  );
}

function LessonHistoryBlock({ childId }: { childId: string }) {
  const { data, isLoading } = useGetChildLessonsQuery(childId);
  const lessons = data?.lessons ?? [];
  if (isLoading) return <div className="h-12 animate-pulse rounded-xl bg-muted" />;
  if (lessons.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-sm font-medium">История занятий</p>
      <div className="space-y-1.5">
        {lessons.slice(0, 12).map((l) => (
          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
            <span className="w-24 shrink-0 text-muted-foreground">{new Date(l.startsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
            <span className="min-w-0 flex-1 truncate">{l.topicTitle ?? '—'} · {l.teacherName}</span>
            <span className={['COMPLETED', 'REPORT_SENT'].includes(l.status) ? 'shrink-0 text-emerald-700' : 'shrink-0 text-muted-foreground'}>
              {LESSON_STATUS_LABELS[l.status as LessonStatusValue] ?? l.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChildCard({ child, forceOpen }: { child: ChildProfileDto; forceOpen?: boolean }) {
  // Пока ребёнок не готов к урокам, карточка раскрыта: именно в ней лежат согласия,
  // фото и персонаж — в свёрнутом виде родитель их просто не находил.
  const [open, setOpen] = useState(!child.readyForLessons);
  const [deleteChild, { isLoading: deleting }] = useDeleteChildMutation();
  const age = ageLabel(child.birthDate);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [forceOpen]);

  const onDelete = async () => {
    const confirmed = window.confirm(
      `Удалить профиль «${child.name}»? Личные поля будут сразу обезличены, а фотографии и материалы — поставлены в защищённую очередь физической очистки. Это действие необратимо.`,
    );
    if (!confirmed) return;
    try {
      const result = await deleteChild(child.id).unwrap();
      toast(result.deletion.status === 'FAILED'
        ? { title: 'Профиль обезличен', description: 'Очередь физической очистки временно недоступна. Ошибка записана в журнал для повторной обработки.', variant: 'destructive' }
        : { title: 'Очистка запущена', description: 'Профиль обезличен. Закрытые файлы удаляет фоновая задача с журналом выполнения.' });
    } catch (err) {
      toast({ title: 'Не удалось удалить', description: apiErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Card ref={cardRef} className="animate-academy-in overflow-hidden border-border bg-card shadow-sm">
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
            <Link href={`/kid/${child.id}`} className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-orange-500 to-amber-400 px-5 py-4 font-bold text-white shadow-sm transition hover:shadow-md">
              <span><Gamepad2 className="mr-2 inline h-5 w-5" /> Открыть игровой профиль {child.name}</span>
              <span aria-hidden>→</span>
            </Link>
            <ConsentsBlock child={child} />
            <PhotosBlock child={child} />
            <CharacterBlock child={child} />
            <ProgressBlock child={child} />
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

function LessonReportsBlock() {
  const { data, isLoading } = useListLessonReportsQuery();
  const [markRead] = useMarkReportReadMutation();
  const reports = data?.reports ?? [];
  if (isLoading) return <div className="mb-6 h-24 animate-pulse rounded-2xl bg-muted" />;
  if (reports.length === 0) return null;
  return (
    <section className="mb-7">
      <h2 className="mb-3 flex items-center gap-2 text-xl font-bold"><FileText className="h-5 w-5 text-primary" /> Отчёты после занятий</h2>
      <div className="space-y-3">{reports.map((report) => (
        <Card key={report.id} className={cn('border-border bg-card', !report.parentReadAt && 'border-orange-300 shadow-sm')}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{report.childName} · {report.teacherName}</p><p className="text-xs text-muted-foreground">{new Date(report.startsAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p></div>{!report.parentReadAt && <Badge className="bg-orange-500">Новый отчёт</Badge>}</div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><p className="font-semibold">Что прошли</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.summary}</p></div><div><p className="font-semibold">Успехи</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.successes}</p></div><div><p className="font-semibold">Рекомендация</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{report.recommendation}</p></div></div>
            {report.resultAssets.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{report.resultAssets.map((asset) => <a key={asset.id} href={asset.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent">{asset.title}<ExternalLink className="h-3 w-3" /></a>)}</div>}
            {!report.parentReadAt && <Button type="button" size="sm" variant="outline" className="mt-4" onClick={() => void markRead(report.id)}>Отметить прочитанным</Button>}
          </CardContent>
        </Card>
      ))}</div>
    </section>
  );
}

export default function FamilyPage() {
  const { data, isLoading } = useListChildrenQuery();
  const [adding, setAdding] = useState(false);
  const [focusChildId, setFocusChildId] = useState<string | null>(null);
  const addFormRef = useRef<HTMLDivElement>(null);
  const children = data?.items ?? [];

  const startAdding = () => {
    setAdding(true);
    // Форма внизу списка — без прокрутки клик по кнопке чеклиста выглядел бы «ничего не произошло».
    window.setTimeout(() => addFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const focusChild = (childId: string) => {
    // Сбрасываем в null, чтобы повторный клик по тому же ребёнку снова сработал.
    setFocusChildId(null);
    window.setTimeout(() => setFocusChildId(childId), 0);
  };

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

          <ParentOnboarding className="mb-7" onAddChild={startAdding} onFocusChild={focusChild} />

          <LessonReportsBlock />

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
                <ChildCard key={child.id} child={child} forceOpen={focusChildId === child.id} />
              ))}

              {adding ? (
                <Card ref={addFormRef} className="border-border bg-card shadow-sm">
                  <CardContent className="px-5 py-5">
                    <p className="mb-4 font-semibold">Новый профиль ребёнка</p>
                    <AddChildForm onDone={() => setAdding(false)} />
                  </CardContent>
                </Card>
              ) : (
                <Button type="button" onClick={startAdding} className="w-full sm:w-auto">
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
