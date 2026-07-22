'use client';

/* eslint-disable @next/next/no-img-element -- private Academy files need browser cookies; the Next image optimizer cannot forward them. */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Flame, Gift, Loader2, LockKeyhole, Medal, Snowflake, Sparkles, Star, Trophy } from 'lucide-react';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useEquipKidRewardMutation, useGetKidProfileQuery } from '@/store/api/academy-gamification-api';

function apiError(error: unknown): string {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    ?? 'Не получилось выполнить действие';
}

export default function KidProfilePage() {
  const { childId } = useParams<{ childId: string }>();
  const { data, isLoading, error } = useGetKidProfileQuery(childId);
  const [equipReward, { isLoading: equipping }] = useEquipKidRewardMutation();
  const profile = data?.profile;
  const equippedBackground = profile?.rewards.find((reward) => reward.equipped && reward.kind === 'BACKGROUND');
  const equippedFrame = profile?.rewards.find((reward) => reward.equipped && reward.kind === 'FRAME');
  const equippedCostume = profile?.rewards.find((reward) => reward.equipped && reward.kind === 'COSTUME');

  const equip = async (rewardId: string) => {
    try {
      await equipReward({ childId, rewardId }).unwrap();
      toast({ title: 'Образ обновлён!', description: 'Награда уже украшает профиль.' });
    } catch (equipError) {
      toast({ title: 'Не удалось выбрать награду', description: apiError(equipError), variant: 'destructive' });
    }
  };

  return (
    <AuthGuard>
      <div className="academy-theme min-h-screen bg-[radial-gradient(circle_at_top,_hsl(35_100%_94%),_white_46%)]">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:py-10">
          <Link href="/family" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Вернуться в семейный кабинет
          </Link>

          {isLoading ? (
            <div className="flex min-h-80 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-primary" /></div>
          ) : error || !profile ? (
            <Card className="border-destructive/30"><CardContent className="p-8 text-center text-destructive">Профиль героя не удалось загрузить.</CardContent></Card>
          ) : (
            <>
              <section className={cn(
                'relative overflow-hidden rounded-[2rem] bg-gradient-to-br p-6 text-white shadow-xl sm:p-8',
                equippedBackground ? 'from-red-500 via-orange-500 to-amber-300' : 'from-orange-500 via-amber-400 to-yellow-300',
              )}>
                <Sparkles className="absolute right-8 top-6 h-20 w-20 rotate-12 opacity-20" />
                <div className="relative flex flex-col items-center gap-6 sm:flex-row">
                  <div className={cn(
                    'flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] border-4 bg-white/25 shadow-lg',
                    equippedFrame ? 'border-yellow-100 ring-4 ring-orange-900/20' : 'border-white/80',
                  )}>
                    {equippedCostume?.assetFileUrl || profile.child.characterImageUrl ? (
                      <img src={equippedCostume?.assetFileUrl ?? profile.child.characterImageUrl!} alt={`Персонаж ${profile.child.name}`} className="h-full w-full object-cover" />
                    ) : (
                      <Star className="h-20 w-20 fill-white/30" />
                    )}
                  </div>
                  <div className="w-full text-center sm:text-left">
                    <Badge className="mb-3 border-0 bg-white/20 text-white hover:bg-white/20">Герой Allvision Academy</Badge>
                    <h1 className="text-4xl font-black tracking-tight sm:text-5xl">{profile.child.name}</h1>
                    {(equippedBackground || equippedFrame || equippedCostume) && (
                      <p className="mt-2 text-sm font-semibold text-white/90">Образ собран из наград коллекции ✨</p>
                    )}
                    <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                      <span className="rounded-full bg-white px-4 py-2 font-bold text-orange-600">Уровень {profile.child.level}</span>
                      <span className="rounded-full bg-orange-900/20 px-4 py-2 font-bold">{profile.child.xp} XP</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-900/20 px-4 py-2 font-bold"><Flame className="h-5 w-5" /> {profile.child.streakCount} дней</span>
                    </div>
                    <div className="mt-5 max-w-xl">
                      <div className="mb-1 flex justify-between text-sm font-semibold"><span>До уровня {profile.child.level + 1}</span><span>{profile.levelProgress.xpNeeded} XP</span></div>
                      <div className="h-4 overflow-hidden rounded-full bg-orange-950/20"><div className="h-full rounded-full bg-white transition-all" style={{ width: `${profile.levelProgress.percent}%` }} /></div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card className="border-orange-200 bg-white/90"><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-orange-100 p-3"><Flame className="h-7 w-7 text-orange-500" /></div><div><p className="text-2xl font-black">{profile.child.streakCount}</p><p className="text-sm text-muted-foreground">огонь серии</p></div></CardContent></Card>
                <Card className="border-sky-200 bg-white/90"><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-sky-100 p-3"><Snowflake className="h-7 w-7 text-sky-500" /></div><div><p className="text-2xl font-black">{profile.child.streakFreezes}</p><p className="text-sm text-muted-foreground">заморозка</p></div></CardContent></Card>
                <Card className="border-violet-200 bg-white/90"><CardContent className="flex items-center gap-4 p-5"><div className="rounded-2xl bg-violet-100 p-3"><Trophy className="h-7 w-7 text-violet-500" /></div><div><p className="text-2xl font-black">{profile.completedLessons}</p><p className="text-sm text-muted-foreground">приключений</p></div></CardContent></Card>
              </div>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><Medal className="h-7 w-7 text-amber-500" /> Достижения</h2>
                <div className="grid gap-4 md:grid-cols-3">
                  {profile.achievements.map((achievement) => {
                    const unlocked = Boolean(achievement.unlockedAt);
                    const percent = Math.min(100, Math.round((achievement.progress / achievement.threshold) * 100));
                    return (
                      <Card key={achievement.id} className={cn('overflow-hidden transition', unlocked ? 'border-amber-300 bg-amber-50 shadow-md' : 'border-border bg-white/70 opacity-75')}>
                        <CardContent className="p-5">
                          <div className="mb-3 flex items-start justify-between"><span className="text-4xl">{achievement.icon}</span>{unlocked ? <Badge className="bg-amber-500">Открыто</Badge> : <LockKeyhole className="h-5 w-5 text-muted-foreground" />}</div>
                          <p className="font-bold">{achievement.title}</p><p className="mt-1 text-sm text-muted-foreground">{achievement.description}</p>
                          {!unlocked && <><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-amber-400" style={{ width: `${percent}%` }} /></div><p className="mt-1 text-xs text-muted-foreground">{achievement.progress} из {achievement.threshold}</p></>}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>

              <section>
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-black"><Gift className="h-7 w-7 text-fuchsia-500" /> Коллекция наград</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {profile.rewards.map((reward) => (
                    <Card key={reward.rewardItemId} className={cn('overflow-hidden', reward.owned ? 'border-fuchsia-200 bg-white shadow-sm' : 'border-dashed bg-white/60 opacity-60')}>
                      {reward.assetFileUrl && <div className="h-36 bg-fuchsia-50"><img src={reward.assetFileUrl} alt={reward.title} className="h-full w-full object-contain" /></div>}
                      <CardContent className="p-5">
                        <div className="flex gap-3"><span className="text-4xl">{reward.icon}</span><div><p className="font-bold">{reward.title}</p><p className="text-xs font-medium text-fuchsia-600">{reward.kindLabel}</p></div></div>
                        <p className="mt-2 text-sm text-muted-foreground">{reward.description}</p>
                        {reward.owned && reward.childRewardId && (
                          <Button className="mt-4 w-full" variant={reward.equipped ? 'secondary' : 'default'} disabled={reward.equipped || equipping} onClick={() => void equip(reward.childRewardId!)}>
                            {reward.equipped ? 'Уже выбрано' : 'Выбрать для профиля'}
                          </Button>
                        )}
                        {!reward.owned && <p className="mt-4 text-xs font-semibold text-muted-foreground"><LockKeyhole className="mr-1 inline h-3.5 w-3.5" /> Выполни достижение, чтобы открыть</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>

              {profile.recentXp.length > 0 && (
                <Card className="border-emerald-200 bg-emerald-50/70"><CardContent className="p-5"><h2 className="mb-3 text-lg font-black">Последние победы</h2><div className="grid gap-2 sm:grid-cols-2">{profile.recentXp.map((event) => <div key={event.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm"><span>{event.reasonLabel}</span><span className="font-black text-emerald-600">+{event.amount} XP</span></div>)}</div></CardContent></Card>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
