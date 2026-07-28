import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, BookOpen, CalendarClock, GraduationCap, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PUBLIC_API_URL, pageMetadata } from '@/lib/seo';

interface TeacherProfile {
  teacherId: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  subjects: string[];
  lessonsCount: number;
  freeSlots: number;
  courses: Array<{ id: string; title: string; level: string | null; subjectTitle: string }>;
}

async function loadTeacher(teacherId: string): Promise<TeacherProfile | null> {
  try {
    const response = await fetch(`${PUBLIC_API_URL}/api/public/academy/teachers/${teacherId}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    return (await response.json()) as TeacherProfile;
  } catch {
    return null;
  }
}

function photoSrc(url: string | null): string | null {
  if (!url) return null;
  return url.startsWith('http') ? url : `${PUBLIC_API_URL}${url}`;
}

export async function generateMetadata({ params }: { params: Promise<{ teacherId: string }> }): Promise<Metadata> {
  const { teacherId } = await params;
  const teacher = await loadTeacher(teacherId);
  if (!teacher) return pageMetadata({ title: 'Преподаватель', description: 'Профиль преподавателя Allvision Academy', path: `/teachers/${teacherId}` });
  return pageMetadata({
    title: `${teacher.name} — преподаватель Allvision Academy`,
    description: teacher.bio?.slice(0, 300) ?? `Преподаватель Allvision Academy. Проведено занятий: ${teacher.lessonsCount}.`,
    path: `/teachers/${teacher.teacherId}`,
  });
}

export default async function TeacherProfilePage({ params }: { params: Promise<{ teacherId: string }> }) {
  const { teacherId } = await params;
  const teacher = await loadTeacher(teacherId);
  if (!teacher) notFound();

  const src = photoSrc(teacher.photoUrl);

  return (
    <div className="academy-theme min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/lessons?tab=book" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> К выбору преподавателя
        </Link>

        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
              <span className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-accent text-3xl font-bold text-accent-foreground">
                {src
                  ? <Image src={src} alt={teacher.name} fill className="object-cover" unoptimized sizes="112px" />
                  : teacher.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
                  <GraduationCap className="h-3.5 w-3.5" /> Преподаватель Academy
                </div>
                <h1 className="text-3xl font-bold tracking-tight">{teacher.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Проведено занятий: {teacher.lessonsCount}
                  {teacher.freeSlots > 0 ? ` · свободных слотов: ${teacher.freeSlots}` : ''}
                </p>
                {teacher.subjects.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {teacher.subjects.map((subject) => (
                      <span key={subject} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                        {subject}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {teacher.bio && (
              <div className="mt-6 border-t border-border pt-5">
                <h2 className="mb-2 text-sm font-semibold">О преподавателе</h2>
                <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{teacher.bio}</p>
              </div>
            )}

            {teacher.courses.length > 0 && (
              <div className="mt-6 border-t border-border pt-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <BookOpen className="h-4 w-4 text-primary" /> Ведёт курсы
                </h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {teacher.courses.map((course) => (
                    <div key={course.id} className="rounded-xl border border-border bg-background p-3">
                      <p className="text-sm font-medium">{course.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {course.subjectTitle}{course.level ? ` · ${course.level}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
              <Button asChild size="lg">
                <Link href="/lessons?tab=book">
                  <CalendarClock className="mr-1.5 h-4 w-4" /> Записаться на занятие
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/#directions"><Sparkles className="mr-1.5 h-4 w-4" /> Все направления</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
