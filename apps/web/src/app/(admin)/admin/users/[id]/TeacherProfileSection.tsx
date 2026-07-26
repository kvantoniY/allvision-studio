'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  useGetAdminTeacherQuery,
  useUpdateAdminTeacherMutation,
  useUploadTeacherPhotoMutation,
} from '@/store/api/admin-teachers-api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function absolutePhoto(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

export function TeacherProfileSection({ userId }: { userId: string }) {
  const { data, isLoading } = useGetAdminTeacherQuery(userId);
  const [update, updateState] = useUpdateAdminTeacherMutation();
  const [uploadPhoto, uploadState] = useUploadTeacherPhotoMutation();
  const fileRef = useRef<HTMLInputElement>(null);

  const [bio, setBio] = useState('');
  const [lessonsManual, setLessonsManual] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setBio(data.bio ?? '');
    setLessonsManual(data.lessonsManual == null ? '' : String(data.lessonsManual));
    setIsActive(data.isActive);
    setCourseIds(data.courseIds);
  }, [data]);

  if (isLoading) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 text-sm text-slate-400">
        Загрузка профиля преподавателя…
      </section>
    );
  }
  if (!data) return null;

  const allCoursesOn = courseIds.length === 0;

  function toggleCourse(id: string) {
    setCourseIds((prev) => {
      // Пустой список = все курсы включены. Первый клик разворачивает в явный список без снятого курса.
      const explicit = prev.length === 0 ? data!.courses.map((c) => c.id) : prev;
      if (explicit.includes(id)) {
        const next = explicit.filter((c) => c !== id);
        return next;
      }
      return [...explicit, id];
    });
  }

  async function save() {
    setMsg(null);
    try {
      await update({
        userId,
        bio: bio.trim() || null,
        lessonsManual: lessonsManual.trim() === '' ? null : Number(lessonsManual),
        courseIds,
        isActive,
      }).unwrap();
      setMsg('Профиль сохранён');
    } catch {
      setMsg('Не удалось сохранить профиль');
    }
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMsg(null);
    try {
      await uploadPhoto({ userId, file }).unwrap();
      setMsg('Фото загружено');
    } catch {
      setMsg('Не удалось загрузить фото');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const photo = absolutePhoto(data.photoUrl);
  const lessonsShown = lessonsManual.trim() === '' ? data.lessonsCompleted : Number(lessonsManual);

  return (
    <section className="rounded-lg border border-violet-500/30 bg-zinc-950 p-5">
      <h2 className="font-semibold text-white">Профиль преподавателя</h2>
      <p className="mt-1 text-xs text-slate-500">
        Фотографию и описание задаёт администратор — преподаватель не загружает их сам.
      </p>

      <div className="mt-4 flex flex-wrap gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="relative h-32 w-32 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
            {photo ? (
              <Image src={photo} alt="Фото преподавателя" fill className="object-cover" unoptimized />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-slate-600">
                {(data.name || data.email).slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          <Button
            type="button"
            variant="outline"
            className="border-zinc-700 text-slate-200"
            disabled={uploadState.isLoading}
            onClick={() => fileRef.current?.click()}
          >
            {uploadState.isLoading ? 'Загрузка…' : photo ? 'Заменить фото' : 'Загрузить фото'}
          </Button>
        </div>

        <div className="min-w-[280px] flex-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="teacher-bio">Описание / автобиография</Label>
            <textarea
              id="teacher-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="Опыт, образование, подход к обучению — то, что увидит родитель."
              className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="teacher-lessons">Проведено уроков (ручное значение)</Label>
              <Input
                id="teacher-lessons"
                type="number"
                min={0}
                value={lessonsManual}
                onChange={(e) => setLessonsManual(e.target.value)}
                placeholder={`Авто: ${data.lessonsCompleted}`}
                className="w-40"
              />
              <p className="text-xs text-slate-500">
                Пусто = считать автоматически ({data.lessonsCompleted}). Показывается родителю: <b>{lessonsShown}</b>.
              </p>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-slate-200">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Активен (виден при записи)
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-zinc-800 pt-4">
        <h3 className="font-medium text-white">Доступные курсы</h3>
        <p className="mt-1 text-xs text-slate-500">
          {allCoursesOn
            ? 'Отмечены все курсы (по умолчанию). Снимите галочки, чтобы ограничить.'
            : 'Отмечены курсы, которые ведёт преподаватель.'}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.courses.map((course) => {
            const on = allCoursesOn || courseIds.includes(course.id);
            return (
              <label
                key={course.id}
                className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm ${
                  on ? 'border-violet-500/50 bg-violet-500/10' : 'border-zinc-800 bg-zinc-900'
                }`}
              >
                <input type="checkbox" checked={on} onChange={() => toggleCourse(course.id)} className="mt-0.5" />
                <span>
                  <span className="block text-slate-100">{course.title}</span>
                  <span className="block text-xs text-slate-500">{course.subjectTitle}</span>
                </span>
              </label>
            );
          })}
          {data.courses.length === 0 && <div className="text-sm text-slate-500">Курсов пока нет</div>}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button type="button" disabled={updateState.isLoading} onClick={save} className="bg-violet-600 hover:bg-violet-500">
          {updateState.isLoading ? 'Сохранение…' : 'Сохранить профиль'}
        </Button>
        {msg && <span className="text-sm text-slate-300">{msg}</span>}
      </div>
    </section>
  );
}
