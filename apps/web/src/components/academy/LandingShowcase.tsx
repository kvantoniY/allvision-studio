import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, BookOpen, GraduationCap, Layers } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PUBLIC_API_URL } from '@/lib/seo';

/**
 * Витрина лендинга: живые преподаватели и учебные программы из БД.
 * Серверные компоненты с кэшем на 5 минут — лендинг остаётся статически быстрым,
 * но показывает реальный состав школы, а не выдуманные карточки.
 */

interface PublicTeacher {
  teacherId: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  subjects: string[];
  lessonsCount: number;
  courses: Array<{ id: string; title: string; subjectTitle: string }>;
}

interface PublicProgram {
  id: string;
  title: string;
  description: string | null;
  courses: Array<{
    id: string;
    title: string;
    level: string | null;
    ageMin: number | null;
    ageMax: number | null;
    description: string | null;
    moduleCount: number;
  }>;
}

async function loadJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${PUBLIC_API_URL}${path}`, { next: { revalidate: 300 } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function photoSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${PUBLIC_API_URL}${url}`;
}

function ageLabel(min: number | null, max: number | null): string | null {
  if (min && max) return `${min}–${max} лет`;
  if (min) return `от ${min} лет`;
  if (max) return `до ${max} лет`;
  return null;
}

export async function TeachersSection() {
  const data = await loadJson<{ teachers: PublicTeacher[] }>('/api/public/academy/teachers');
  const teachers = data?.teachers ?? [];
  // Пока преподавателей нет, секцию не показываем — пустой блок хуже отсутствия блока.
  if (teachers.length === 0) return null;

  return (
    <section id="teachers" className="scroll-mt-20 bg-secondary/55 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto mb-9 max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Преподаватели</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Живой учитель ведёт каждое занятие</h2>
          <p className="mt-3 text-muted-foreground">
            Урок идёт по видеосвязи: учитель объясняет, задаёт темп и помогает, когда не получается.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teachers.slice(0, 6).map((teacher) => {
            const src = photoSrc(teacher.photoUrl);
            return (
              <Link key={teacher.teacherId} href={`/teachers/${teacher.teacherId}`} className="group">
                <Card className="h-full border-border bg-background shadow-sm transition hover:border-primary/50 hover:shadow-md">
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="flex items-center gap-3">
                      <span className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent text-xl font-bold text-accent-foreground">
                        {src
                          ? <Image src={src} alt={teacher.name} fill className="object-cover" unoptimized sizes="64px" />
                          : teacher.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{teacher.name}</p>
                        <p className="text-xs text-muted-foreground">Провёл занятий: {teacher.lessonsCount}</p>
                      </div>
                    </div>

                    {teacher.bio && (
                      <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted-foreground">{teacher.bio}</p>
                    )}

                    {teacher.subjects.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {teacher.subjects.slice(0, 3).map((subject) => (
                          <span key={subject} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                            {subject}
                          </span>
                        ))}
                      </div>
                    )}

                    <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Профиль
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export async function ProgramsSection() {
  const data = await loadJson<{ subjects: PublicProgram[] }>('/api/public/academy/programs');
  const subjects = data?.subjects ?? [];
  if (subjects.length === 0) return null;

  return (
    <section id="programs" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
      <div className="mx-auto mb-9 max-w-2xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Программы</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Что изучает ребёнок</h2>
        <p className="mt-3 text-muted-foreground">
          Каждый курс разбит на модули и темы: виден понятный учебный результат, а не набор занятий.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {subjects.map((subject) => (
          <Card key={subject.id} className="border-border shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <GraduationCap className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-semibold">{subject.title}</h3>
                  {subject.description && <p className="mt-1 text-sm text-muted-foreground">{subject.description}</p>}
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {subject.courses.slice(0, 4).map((course) => {
                  const age = ageLabel(course.ageMin, course.ageMax);
                  return (
                    <div key={course.id} className="rounded-xl border border-border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{course.title}</p>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {course.level && <span className="rounded-full bg-muted px-2 py-0.5">{course.level}</span>}
                          {age && <span>{age}</span>}
                        </div>
                      </div>
                      {course.description && (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{course.description}</p>
                      )}
                      {course.moduleCount > 0 && (
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Layers className="h-3 w-3" /> модулей: {course.moduleCount}
                        </p>
                      )}
                    </div>
                  );
                })}
                {subject.courses.length > 4 && (
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <BookOpen className="h-3.5 w-3.5" /> и ещё курсов: {subject.courses.length - 4}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
