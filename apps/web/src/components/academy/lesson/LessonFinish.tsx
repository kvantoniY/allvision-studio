'use client';

import Link from 'next/link';
import { CalendarClock, Flame, Sparkles, Star, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGetLessonChildOverviewQuery } from '@/store/api/academy-booking-api';

/**
 * Экран результата урока для ученика. Раньше при завершении урока учителем ребёнок
 * просто оставался в комнате: ничего не менялось, опыт начислялся молча, и было
 * непонятно, что занятие закончилось и что он получил.
 */
export function LessonFinish({ lessonId }: { lessonId: string }) {
  // Данные читаем после завершения: XP урока уже начислен транзакцией статуса.
  const { data, isLoading } = useGetLessonChildOverviewQuery(lessonId, { pollingInterval: 4000 });

  return (
    <div className="academy-theme flex h-dvh flex-col items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(35_100%_94%),_white_55%)] px-4 py-8 text-foreground">
      <div className="animate-academy-in w-full max-w-lg rounded-[2rem] border border-orange-200 bg-white p-7 text-center shadow-xl sm:p-9">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-400 text-4xl shadow-lg">
          🎉
        </div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Урок завершён!</h1>
        <p className="mt-2 text-muted-foreground">
          {data?.name ? `${data.name}, отличная работа. Вот твой результат:` : 'Отличная работа. Вот твой результат:'}
        </p>

        {isLoading || !data ? (
          <div className="mt-6 h-32 animate-pulse rounded-2xl bg-muted" />
        ) : (
          <>
            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-orange-50 p-4">
                <p className="text-2xl font-black text-orange-600">+{data.lessonXp}</p>
                <p className="text-xs text-muted-foreground">опыта за урок</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-4">
                <p className="flex items-center justify-center gap-1 text-2xl font-black text-violet-600">
                  <Star className="h-5 w-5 fill-violet-500 text-violet-500" />{data.level}
                </p>
                <p className="text-xs text-muted-foreground">уровень</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="flex items-center justify-center gap-1 text-2xl font-black text-amber-600">
                  <Flame className="h-5 w-5" />{data.streakCount}
                </p>
                <p className="text-xs text-muted-foreground">дней подряд</p>
              </div>
            </div>

            <div className="mt-5 text-left">
              <div className="mb-1 flex justify-between text-xs font-medium text-muted-foreground">
                <span>До уровня {data.level + 1}</span>
                <span>{data.xpIntoLevel} / {data.xpIntoLevel + data.xpNeeded} XP</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all" style={{ width: `${data.percent}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Ещё {data.xpNeeded} XP — и новый уровень.
              </p>
            </div>

            {data.achievements.length > 0 && (
              <div className="mt-5 rounded-2xl bg-emerald-50 p-4 text-left">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-emerald-800">
                  <Trophy className="h-4 w-4" /> Новые достижения
                </p>
                <div className="flex flex-wrap gap-2">
                  {data.achievements.map((achievement, index) => (
                    <span key={index} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-medium shadow-sm">
                      <span className="text-lg">{achievement.icon}</span> {achievement.title}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <Button asChild size="lg" className="flex-1">
                <Link href={`/kid/${data.childId}`}>
                  <Sparkles className="mr-1.5 h-4 w-4" /> Мой профиль героя
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="flex-1">
                <Link href="/lessons">
                  <CalendarClock className="mr-1.5 h-4 w-4" /> К занятиям
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Отчёт преподавателя появится в разделе «Семья» — там же вся история занятий.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
