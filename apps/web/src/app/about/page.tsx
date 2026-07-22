import type { Metadata } from 'next';
import { BookOpenCheck, Gamepad2, GraduationCap, ShieldCheck, Sparkles } from 'lucide-react';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'О школе',
  description: 'Как устроена Allvision Academy: живой преподаватель, персональная учебная программа, AI-персонаж ребёнка и интерактивные уроки.',
  path: '/about',
});

const principles = [
  { icon: GraduationCap, title: 'Учитель остаётся главным', text: 'Преподаватель объясняет, замечает трудности и ведёт ребёнка по программе. AI только помогает подготовить персональный мир.' },
  { icon: Gamepad2, title: 'Знание превращается в действие', text: 'Ребёнок не смотрит длинную лекцию: отвечает, управляет сценой, решает задачу и сразу видит результат.' },
  { icon: BookOpenCheck, title: 'Прогресс понятен родителю', text: 'После занятия сохраняются пройденные темы и навыки, награды, рекомендации и отчёт преподавателя.' },
  { icon: ShieldCheck, title: 'Детские материалы закрыты', text: 'Фото, AI-персонаж и результаты не попадают в публичную библиотеку. Доступ ограничен участниками учебного процесса.' },
];

export default function AboutPage() {
  return (
    <section className="container py-14 md:py-20">
      <div className="max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">О школе</p>
        <h1 className="mt-3 text-4xl font-bold md:text-6xl">Урок, построенный вокруг конкретного ребёнка</h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
          Allvision Academy соединяет живого преподавателя, последовательную учебную программу и интерактивную историю.
          Ребёнок видит в сценах собственного персонажа, а учебная задача становится частью приключения.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {principles.map((item) => (
          <article key={item.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><item.icon className="h-5 w-5" /></span>
            <h2 className="mt-5 text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 leading-7 text-muted-foreground">{item.text}</p>
          </article>
        ))}
      </div>

      <div className="mt-12 rounded-3xl bg-secondary p-7 md:p-10">
        <Sparkles className="h-7 w-7 text-primary" />
        <h2 className="mt-4 text-2xl font-bold">С чего начинаем</h2>
        <p className="mt-3 max-w-3xl leading-7 text-muted-foreground">
          Первые направления — английский язык, нейросети и AI-контент, программирование. Родитель может начать с одного
          25-минутного занятия, затем выбрать пакет и отслеживать обучение в семейном кабинете.
        </p>
      </div>
    </section>
  );
}
