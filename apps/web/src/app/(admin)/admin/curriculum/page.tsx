'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, GraduationCap, Loader2, Plus, Trash2 } from 'lucide-react';
import { TOPIC_DURATIONS } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useCreateCourseMutation,
  useCreateModuleMutation,
  useCreateSkillMutation,
  useCreateSubjectMutation,
  useCreateTopicMutation,
  useDeleteCourseMutation,
  useDeleteModuleMutation,
  useDeleteSkillMutation,
  useDeleteSubjectMutation,
  useDeleteTopicMutation,
  useGetCurriculumQuery,
  useUpdateTopicMutation,
  type CurriculumCourse,
  type CurriculumSkill,
  type CurriculumSubject,
  type CurriculumTopic,
} from '@/store/api/admin-curriculum-api';

function apiError(err: unknown): string {
  const data = (err as { data?: { error?: { message?: string } } })?.data;
  return data?.error?.message ?? 'Ошибка, попробуйте ещё раз';
}

const panel = 'rounded-xl border border-zinc-800 bg-zinc-900/60 p-4';
const rowActive = 'bg-violet-500/15 ring-1 ring-inset ring-violet-500/40 text-white';
const rowIdle = 'text-slate-300 hover:bg-zinc-800/60 hover:text-white';

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

// === Направления ===
function SubjectsColumn({
  subjects,
  selectedId,
  onSelect,
}: {
  subjects: CurriculumSubject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [createSubject, { isLoading }] = useCreateSubjectMutation();
  const [deleteSubject] = useDeleteSubjectMutation();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    try {
      const created = await createSubject({ title: title.trim(), slug: slugify(title) }).unwrap();
      setTitle('');
      setAdding(false);
      onSelect(created.id);
    } catch (err) {
      toast({ title: 'Не удалось создать', description: apiError(err), variant: 'destructive' });
    }
  };

  return (
    <div className={panel}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Направления</h2>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {adding && (
        <div className="mb-3 space-y-2">
          <Input placeholder="Например, Английский язык" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button size="sm" className="w-full" disabled={isLoading || !title.trim()} onClick={submit}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Создать
          </Button>
        </div>
      )}
      <div className="space-y-1">
        {subjects.map((s) => (
          <div
            key={s.id}
            className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', s.id === selectedId ? rowActive : rowIdle)}
          >
            <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(s.id)}>
              {s.title}
            </button>
            <span className="text-xs text-slate-500">{s.courses.length}</span>
            <button
              type="button"
              aria-label="Удалить"
              className="text-slate-500 hover:text-rose-400"
              onClick={async () => {
                if (!window.confirm(`Удалить направление «${s.title}» со всеми курсами?`)) return;
                await deleteSubject(s.id).unwrap().catch((err) => toast({ title: 'Ошибка', description: apiError(err), variant: 'destructive' }));
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {subjects.length === 0 && <p className="text-sm text-slate-500">Пока нет направлений.</p>}
      </div>
    </div>
  );
}

// === Курсы + навыки направления ===
function CoursesColumn({
  subject,
  selectedCourseId,
  onSelect,
  skills,
}: {
  subject: CurriculumSubject;
  selectedCourseId: string | null;
  onSelect: (id: string) => void;
  skills: CurriculumSkill[];
}) {
  const [createCourse, { isLoading }] = useCreateCourseMutation();
  const [deleteCourse] = useDeleteCourseMutation();
  const [createSkill] = useCreateSkillMutation();
  const [deleteSkill] = useDeleteSkillMutation();
  const [title, setTitle] = useState('');
  const [level, setLevel] = useState('');
  const [adding, setAdding] = useState(false);
  const [skillTitle, setSkillTitle] = useState('');

  const subjectSkills = skills.filter((sk) => sk.subjectId === subject.id);

  const submit = async () => {
    try {
      const created = await createCourse({
        subjectId: subject.id,
        title: title.trim(),
        slug: slugify(`${subject.slug}-${title}`),
        level: level.trim() || null,
      }).unwrap();
      setTitle('');
      setLevel('');
      setAdding(false);
      onSelect(created.id);
    } catch (err) {
      toast({ title: 'Не удалось создать курс', description: apiError(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      <div className={panel}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Курсы · {subject.title}</h2>
          <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {adding && (
          <div className="mb-3 space-y-2">
            <Input placeholder="Название курса" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Уровень (A0, A1…)" value={level} onChange={(e) => setLevel(e.target.value)} />
            <Button size="sm" className="w-full" disabled={isLoading || !title.trim()} onClick={submit}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Создать курс
            </Button>
          </div>
        )}
        <div className="space-y-1">
          {subject.courses.map((c) => (
            <div key={c.id} className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-sm', c.id === selectedCourseId ? rowActive : rowIdle)}>
              <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(c.id)}>
                {c.title} {c.level && <span className="text-xs text-slate-500">· {c.level}</span>}
              </button>
              <button
                type="button"
                aria-label="Удалить"
                className="text-slate-500 hover:text-rose-400"
                onClick={async () => {
                  if (!window.confirm(`Удалить курс «${c.title}»?`)) return;
                  await deleteCourse(c.id).unwrap().catch((err) => toast({ title: 'Ошибка', description: apiError(err), variant: 'destructive' }));
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {subject.courses.length === 0 && <p className="text-sm text-slate-500">Нет курсов.</p>}
        </div>
      </div>

      <div className={panel}>
        <h2 className="mb-3 text-sm font-semibold text-white">Навыки направления</h2>
        <div className="mb-3 flex gap-2">
          <Input placeholder="Знает числа 1–10" value={skillTitle} onChange={(e) => setSkillTitle(e.target.value)} />
          <Button
            size="sm"
            disabled={!skillTitle.trim()}
            onClick={async () => {
              try {
                await createSkill({ subjectId: subject.id, title: skillTitle.trim(), slug: slugify(`${subject.slug}-${skillTitle}`) }).unwrap();
                setSkillTitle('');
              } catch (err) {
                toast({ title: 'Ошибка', description: apiError(err), variant: 'destructive' });
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {subjectSkills.map((sk) => (
            <span key={sk.id} className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-800/60 px-2.5 py-1 text-xs text-slate-300">
              {sk.title}
              <button type="button" aria-label="Удалить навык" className="text-slate-500 hover:text-rose-400" onClick={() => deleteSkill(sk.id)}>
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
          {subjectSkills.length === 0 && <p className="text-sm text-slate-500">Навыки задают, что осваивает ребёнок.</p>}
        </div>
      </div>
    </div>
  );
}

// === Тема (редактор) ===
function TopicRow({ topic, subjectSkills, courseTopics }: { topic: CurriculumTopic; subjectSkills: CurriculumSkill[]; courseTopics: CurriculumTopic[] }) {
  const [updateTopic, { isLoading }] = useUpdateTopicMutation();
  const [deleteTopic] = useDeleteTopicMutation();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(topic.title);
  const [goal, setGoal] = useState(topic.goal ?? '');
  const [duration, setDuration] = useState(topic.durationMin);
  const [difficulty, setDifficulty] = useState(topic.difficulty);
  const [aiBudget, setAiBudget] = useState(topic.aiBudgetUsd);
  const [skillIds, setSkillIds] = useState<string[]>(topic.skills.map((s) => s.skillId));
  const prerequisites = Array.isArray((topic.content as { prerequisites?: string[] } | null)?.prerequisites)
    ? ((topic.content as { prerequisites?: string[] }).prerequisites as string[])
    : [];
  const [prereqIds, setPrereqIds] = useState<string[]>(prerequisites);

  const save = async () => {
    try {
      await updateTopic({
        id: topic.id,
        body: {
          title: title.trim(),
          goal: goal.trim() || null,
          durationMin: duration,
          difficulty,
          aiBudgetUsd: aiBudget,
          skillIds,
          content: { ...(topic.content ?? {}), prerequisites: prereqIds },
        },
      }).unwrap();
      toast({ title: 'Тема сохранена' });
      setOpen(false);
    } catch (err) {
      toast({ title: 'Ошибка', description: apiError(err), variant: 'destructive' });
    }
  };

  const toggle = (list: string[], id: string, setter: (v: string[]) => void) =>
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40">
      <div className="flex items-center gap-2 px-3 py-2">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((v) => !v)}>
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-slate-500 transition-transform', open && 'rotate-90')} />
          <span className="truncate text-sm text-slate-200">{topic.title}</span>
          <span className="text-xs text-slate-500">{topic.durationMin} мин</span>
        </button>
        <button
          type="button"
          aria-label="Удалить тему"
          className="text-slate-500 hover:text-rose-400"
          onClick={async () => {
            if (!window.confirm(`Удалить тему «${topic.title}»?`)) return;
            await deleteTopic(topic.id).unwrap().catch((err) => toast({ title: 'Ошибка', description: apiError(err), variant: 'destructive' }));
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="space-y-3 border-t border-zinc-800 p-3">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Образовательная цель</Label>
            <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Числа от 1 до 10" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Длительность</Label>
              <div className="flex gap-1">
                {TOPIC_DURATIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDuration(d)}
                    className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs', duration === d ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-zinc-700 text-slate-400')}
                  >
                    {d} мин
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Сложность</Label>
              <Input type="number" min={1} max={5} value={difficulty} onChange={(e) => setDifficulty(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>AI-бюджет $</Label>
              <Input type="number" min={0} step={0.1} value={aiBudget} onChange={(e) => setAiBudget(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Навыки темы</Label>
            <div className="flex flex-wrap gap-1.5">
              {subjectSkills.map((sk) => (
                <button
                  key={sk.id}
                  type="button"
                  onClick={() => toggle(skillIds, sk.id, setSkillIds)}
                  className={cn('rounded-full border px-2.5 py-1 text-xs', skillIds.includes(sk.id) ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-zinc-700 text-slate-400')}
                >
                  {sk.title}
                </button>
              ))}
              {subjectSkills.length === 0 && <span className="text-xs text-slate-500">Сначала добавьте навыки направления.</span>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Предыдущие темы (prerequisites)</Label>
            <div className="flex flex-wrap gap-1.5">
              {courseTopics.filter((t) => t.id !== topic.id).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggle(prereqIds, t.id, setPrereqIds)}
                  className={cn('rounded-full border px-2.5 py-1 text-xs', prereqIds.includes(t.id) ? 'border-violet-500 bg-violet-500/15 text-white' : 'border-zinc-700 text-slate-400')}
                >
                  {t.title}
                </button>
              ))}
              {courseTopics.length <= 1 && <span className="text-xs text-slate-500">Другие темы курса появятся здесь.</span>}
            </div>
          </div>
          <Button size="sm" disabled={isLoading} onClick={save}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Сохранить тему
          </Button>
        </div>
      )}
    </div>
  );
}

// === Модули + темы курса ===
function CourseDetail({ course, subjectSkills }: { course: CurriculumCourse; subjectSkills: CurriculumSkill[] }) {
  const [createModule] = useCreateModuleMutation();
  const [deleteModule] = useDeleteModuleMutation();
  const [createTopic] = useCreateTopicMutation();
  const [moduleTitle, setModuleTitle] = useState('');
  const allTopics = course.modules.flatMap((m) => m.topics);

  return (
    <div className={panel}>
      <h2 className="mb-3 text-sm font-semibold text-white">Модули и темы · {course.title}</h2>
      <div className="mb-4 flex gap-2">
        <Input placeholder="Новый модуль" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} />
        <Button
          size="sm"
          disabled={!moduleTitle.trim()}
          onClick={async () => {
            try {
              await createModule({ courseId: course.id, title: moduleTitle.trim() }).unwrap();
              setModuleTitle('');
            } catch (err) {
              toast({ title: 'Ошибка', description: apiError(err), variant: 'destructive' });
            }
          }}
        >
          <Plus className="h-4 w-4" /> Модуль
        </Button>
      </div>
      <div className="space-y-4">
        {course.modules.map((m) => (
          <ModuleBlock key={m.id} module={m} subjectSkills={subjectSkills} allTopics={allTopics} onDelete={() => deleteModule(m.id)} onAddTopic={(title) => createTopic({ moduleId: m.id, title })} />
        ))}
        {course.modules.length === 0 && <p className="text-sm text-slate-500">Добавьте первый модуль.</p>}
      </div>
    </div>
  );
}

function ModuleBlock({
  module,
  subjectSkills,
  allTopics,
  onDelete,
  onAddTopic,
}: {
  module: CurriculumCourse['modules'][number];
  subjectSkills: CurriculumSkill[];
  allTopics: CurriculumTopic[];
  onDelete: () => void;
  onAddTopic: (title: string) => Promise<unknown>;
}) {
  const [topicTitle, setTopicTitle] = useState('');
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">{module.title}</h3>
        <button
          type="button"
          aria-label="Удалить модуль"
          className="text-slate-500 hover:text-rose-400"
          onClick={() => {
            if (window.confirm(`Удалить модуль «${module.title}»?`)) onDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-1.5">
        {module.topics.map((t) => (
          <TopicRow key={t.id} topic={t} subjectSkills={subjectSkills} courseTopics={allTopics} />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Input placeholder="Новая тема" value={topicTitle} onChange={(e) => setTopicTitle(e.target.value)} className="h-9" />
        <Button
          size="sm"
          variant="outline"
          disabled={!topicTitle.trim()}
          onClick={async () => {
            await onAddTopic(topicTitle.trim());
            setTopicTitle('');
          }}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function AdminCurriculumPage() {
  const { data, isLoading } = useGetCurriculumQuery();
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);

  const subjects = data?.subjects ?? [];
  const skills = useMemo(() => data?.skills ?? [], [data]);
  const subject = subjects.find((s) => s.id === subjectId) ?? subjects[0] ?? null;
  const course = subject?.courses.find((c) => c.id === courseId) ?? null;
  const subjectSkills = skills.filter((sk) => sk.subjectId === subject?.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-300">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-white">Учебная программа</h1>
          <p className="text-sm text-slate-400">Направление → Курс → Модуль → Тема → Навыки</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl bg-zinc-900/60" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)_minmax(320px,2fr)]">
          <SubjectsColumn subjects={subjects} selectedId={subject?.id ?? null} onSelect={(id) => { setSubjectId(id); setCourseId(null); }} />
          {subject ? (
            <CoursesColumn subject={subject} selectedCourseId={course?.id ?? null} onSelect={setCourseId} skills={skills} />
          ) : (
            <div className={panel}><p className="text-sm text-slate-500">Выберите направление.</p></div>
          )}
          {course ? (
            <CourseDetail course={course} subjectSkills={subjectSkills} />
          ) : (
            <div className={panel}><p className="text-sm text-slate-500">Выберите курс, чтобы собрать модули и темы.</p></div>
          )}
        </div>
      )}
    </div>
  );
}
