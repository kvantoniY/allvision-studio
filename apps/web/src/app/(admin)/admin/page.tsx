import Link from 'next/link';
import {
  ArrowRight,
  Blocks,
  Clapperboard,
  GraduationCap,
  HandCoins,
  Library,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { requireAcademyStaffPage } from '@/lib/auth';

type DashboardCard = { href: string; title: string; description: string; icon: LucideIcon; adminOnly?: boolean };

const cards: DashboardCard[] = [
  { href: '/admin/curriculum', title: 'Учебная программа', description: 'Направления, курсы, модули, темы и навыки.', icon: GraduationCap },
  { href: '/admin/constructor', title: 'Конструктор уроков', description: 'Интерактивные шаблоны, сцены и публикации версий.', icon: Blocks },
  { href: '/admin/library', title: 'Материалы Академии', description: 'Общая библиотека фонов, объектов и учебных ассетов.', icon: Library },
  { href: '/admin/scene-player', title: 'Проверка сцен', description: 'Быстрый runtime-просмотр интерактива перед уроком.', icon: Clapperboard },
  { href: '/admin/messages', title: 'Диалоги', description: 'Подключение администратора к общению родителя и учителя.', icon: MessageCircle, adminOnly: true },
  { href: '/admin/payouts', title: 'Выплаты преподавателям', description: 'Формирование периодов, подтверждения и корректировки.', icon: HandCoins, adminOnly: true },
];

export default async function AdminIndexPage() {
  const me = await requireAcademyStaffPage();
  const visibleCards = cards.filter((card) => !card.adminOnly || me.role === 'ADMIN');

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-card p-7 shadow-sm sm:p-9">
        <div aria-hidden className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Центр управления Academy
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Управляйте обучением в одном месте</h1>
          <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
            Создавайте программы и интерактивные уроки, проверяйте материалы и ведите операционные задачи Allvision Academy.
          </p>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold">Рабочие разделы</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCards.map((card) => (
            <Link key={card.href} href={card.href} className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground"><card.icon className="h-5 w-5" /></span>
              <h3 className="mt-4 flex items-center gap-2 font-semibold">{card.title}<ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" /></h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{card.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="rounded-2xl border border-dashed border-border bg-background/70 px-5 py-4 text-sm text-muted-foreground">
        Контентный контур доступен администратору и методисту. Диалоги и выплаты преподавателям — только администратору.
      </div>
    </div>
  );
}
