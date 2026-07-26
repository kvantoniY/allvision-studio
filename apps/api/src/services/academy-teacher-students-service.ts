import { prisma } from '@allvision/database';
import { buildChildProgress } from './academy-progress-service';

/** История уроков ребёнка (с кем, когда, тема, статус, есть ли отчёт) — для учителя и родителя. */
export async function buildChildLessonHistory(childId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { childId },
    orderBy: { startsAt: 'desc' },
    take: 200,
    select: {
      id: true,
      startsAt: true,
      durationMin: true,
      status: true,
      topicId: true,
      teacher: { select: { user: { select: { name: true, email: true } } } },
      report: { select: { id: true } },
    },
  });
  const topicIds = [...new Set(lessons.map((l) => l.topicId).filter((v): v is string => Boolean(v)))];
  const topics = topicIds.length
    ? await prisma.topic.findMany({ where: { id: { in: topicIds } }, select: { id: true, title: true } })
    : [];
  const topicTitle = new Map(topics.map((t) => [t.id, t.title]));

  return lessons.map((l) => ({
    id: l.id,
    startsAt: l.startsAt.toISOString(),
    durationMin: l.durationMin,
    status: l.status,
    topicTitle: l.topicId ? topicTitle.get(l.topicId) ?? null : null,
    teacherName: l.teacher.user.name ?? l.teacher.user.email,
    hasReport: Boolean(l.report),
  }));
}

/** Список учеников преподавателя (кого он вёл), с датой последнего занятия и заметкой. */
export async function buildTeacherStudents(teacherProfileId: string) {
  const lessons = await prisma.lesson.findMany({
    where: { teacherId: teacherProfileId },
    orderBy: { startsAt: 'desc' },
    select: { childId: true, startsAt: true, status: true, child: { select: { name: true } } },
  });

  type Row = { childId: string; name: string; lastLessonAt: string; lastStatus: string; total: number; completed: number };
  const byChild = new Map<string, Row>();
  for (const l of lessons) {
    let row = byChild.get(l.childId);
    if (!row) {
      row = { childId: l.childId, name: l.child.name, lastLessonAt: l.startsAt.toISOString(), lastStatus: l.status, total: 0, completed: 0 };
      byChild.set(l.childId, row);
    }
    row.total += 1;
    if (l.status === 'COMPLETED' || l.status === 'REPORT_SENT') row.completed += 1;
  }

  const notes = await prisma.teacherStudentNote.findMany({
    where: { teacherId: teacherProfileId, childId: { in: [...byChild.keys()] } },
    select: { childId: true, note: true },
  });
  const noteByChild = new Map(notes.map((n) => [n.childId, n.note]));

  return [...byChild.values()].map((row) => ({ ...row, note: noteByChild.get(row.childId) ?? null }));
}

/** Преподаватель вёл этого ребёнка? (гейт доступа к профилю ученика). */
export async function teacherTaughtChild(teacherProfileId: string, childId: string): Promise<boolean> {
  const lesson = await prisma.lesson.findFirst({ where: { teacherId: teacherProfileId, childId }, select: { id: true } });
  return Boolean(lesson);
}

/** Полный профиль ученика для преподавателя: прогресс по программе + история + заметка. */
export async function buildTeacherStudentDetail(teacherProfileId: string, childId: string) {
  const child = await prisma.childProfile.findUnique({ where: { id: childId }, select: { name: true, birthDate: true } });
  const [progress, history, note] = await Promise.all([
    buildChildProgress(childId),
    buildChildLessonHistory(childId),
    prisma.teacherStudentNote.findUnique({
      where: { teacherId_childId: { teacherId: teacherProfileId, childId } },
      select: { note: true, updatedAt: true },
    }),
  ]);
  return {
    childId,
    name: child?.name ?? '',
    birthDate: child?.birthDate ? child.birthDate.toISOString().slice(0, 10) : null,
    progress,
    history,
    note: note?.note ?? null,
    noteUpdatedAt: note?.updatedAt ? note.updatedAt.toISOString() : null,
  };
}

/** Сохраняет/удаляет заметку преподавателя по ученику. */
export async function saveTeacherStudentNote(teacherProfileId: string, childId: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) {
    await prisma.teacherStudentNote.deleteMany({ where: { teacherId: teacherProfileId, childId } });
    return null;
  }
  const saved = await prisma.teacherStudentNote.upsert({
    where: { teacherId_childId: { teacherId: teacherProfileId, childId } },
    create: { teacherId: teacherProfileId, childId, note: trimmed },
    update: { note: trimmed },
    select: { note: true, updatedAt: true },
  });
  return { note: saved.note, updatedAt: saved.updatedAt.toISOString() };
}
