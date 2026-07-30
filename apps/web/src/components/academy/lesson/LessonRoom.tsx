'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2, ChevronLeft, ChevronRight, Eraser, Gift, Loader2, LogOut, Maximize2,
  Minimize2, Pencil, Unlock, Video,
} from 'lucide-react';
import {
  LESSON_DRAW_COLORS,
  type AcademySceneRuntimeEvent,
  type LessonPoint,
  type LessonRole,
  type LessonServerMessage,
  type LessonStroke,
  type MiniGameState,
} from '@allvision/shared';
import { AcademyScenePlayer, type AcademyScenePlayerHandle } from '@/components/academy/scene-player';
import { DrawingCanvas } from '@/components/academy/lesson/DrawingCanvas';
import { LessonLab } from '@/components/academy/lesson/LessonLab';
import { LessonFinish } from '@/components/academy/lesson/LessonFinish';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { connectLessonSocket, type LessonSocket } from '@/lib/lesson-socket';
import { useGetInstanceByLessonQuery, useGetInstanceScenesQuery } from '@/store/api/academy-lesson-instances-api';
import { useGetLessonChildOverviewQuery, useSetLessonStatusMutation, useSetMeetingLinkMutation } from '@/store/api/academy-booking-api';
import { toast } from '@/hooks/use-toast';

/**
 * Комната урока: интерактивный инструмент (сцены + рисование учителя), синхронизированный
 * по WebSocket. Видеосвязь и голосовой чат вынесены во внешний сервис (Яндекс Телемост):
 * учитель добавляет ссылку, обе стороны открывают звонок в отдельной вкладке.
 */
export function LessonRoom({ lessonId }: { lessonId: string }) {
  // Пока урок не подготовлен — опрашиваем, чтобы ученик автоматически вошёл, как только
  // преподаватель всё подготовит. Как только экземпляр появился — поллинг выключаем.
  const instanceReadyRef = useRef(false);
  // Пока урок не подготовлен — частый поллинг (ученик войдёт автоматически).
  // Дальше у ученика остаётся редкий поллинг: если WS-событие о завершении не дошло
  // (обрыв связи), экран результата всё равно появится максимум через 20 секунд.
  const roleRef = useRef<LessonRole | null>(null);
  const instanceQuery = useGetInstanceByLessonQuery(lessonId, {
    pollingInterval: instanceReadyRef.current ? (roleRef.current === 'teacher' ? 0 : 20000) : 5000,
    skipPollingIfUnfocused: true,
  });
  instanceReadyRef.current = Boolean(instanceQuery.data?.instance);
  const instanceId = instanceQuery.data?.instance?.id;
  const scenesQuery = useGetInstanceScenesQuery(instanceId ?? '', { skip: !instanceId });

  const router = useRouter();
  const [setLessonStatus] = useSetLessonStatusMutation();
  const [setMeetingLink, meetingState] = useSetMeetingLinkMutation();
  const [ending, setEnding] = useState(false);

  const [role, setRole] = useState<LessonRole | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneCount, setSceneCount] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [strokes, setStrokes] = useState<LessonStroke[]>([]);
  const [reward, setReward] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [penOn, setPenOn] = useState(false);
  const [penColor, setPenColor] = useState<string>(LESSON_DRAW_COLORS[0]);
  const [linkDraft, setLinkDraft] = useState('');
  const [editingLink, setEditingLink] = useState(false);
  // Урок завершён учителем: ученик видит экран результата (WS-событие или статус урока).
  const [finished, setFinished] = useState(false);

  const socketRef = useRef<LessonSocket | null>(null);
  const playerRef = useRef<AcademyScenePlayerHandle | null>(null);
  // Снимки игр приходят раньше, чем плеер новой сцены готов их принять.
  const pendingGamesRef = useRef<Record<string, MiniGameState>>({});
  const rootRef = useRef<HTMLDivElement>(null);

  const scenes = useMemo(() => scenesQuery.data?.scenes ?? [], [scenesQuery.data]);
  const meetingUrl = instanceQuery.data?.meetingUrl ?? null;

  const applyStart = useCallback((s: LessonStroke) => setStrokes((p) => [...p, s]), []);
  const applyAppend = useCallback((id: string, points: LessonPoint[]) => {
    setStrokes((p) => p.map((s) => (s.id === id ? { ...s, points: [...s.points, ...points] } : s)));
  }, []);

  const ready = Boolean(instanceQuery.data?.instance);

  // WebSocket-синхронизация урока (сцены, разблокировка, рисование, награда) — без изменений.
  useEffect(() => {
    if (!ready) return;
    const socket = connectLessonSocket(lessonId, {
      onStatus: setStatus,
      onLatency: setLatencyMs,
      onMessage: (msg: LessonServerMessage) => {
        switch (msg.t) {
          case 'state':
            setRole(msg.role);
            setSceneIndex(msg.state.sceneIndex);
            setSceneCount(msg.state.sceneCount);
            setUnlocked(msg.state.unlocked);
            setStrokes(msg.state.strokes);
            pendingGamesRef.current = msg.state.games;
            break;
          case 'nav':
            setSceneIndex(msg.sceneIndex);
            setStrokes(msg.strokes);
            // Игры новой сцены применяем после перерисовки плеера.
            pendingGamesRef.current = msg.games;
            break;
          case 'unlock': setUnlocked(msg.value); break;
          case 'draw-start': applyStart({ id: msg.id, color: msg.color, size: msg.size, points: [msg.point] }); break;
          case 'draw-append': applyAppend(msg.id, msg.points); break;
          case 'draw-clear': setStrokes([]); break;
          case 'reward': setReward(true); setTimeout(() => setReward(false), 2600); break;
          case 'scene-event': playerRef.current?.send({ ...msg.event, role: msg.from }); break;
          case 'game': playerRef.current?.setGameState(msg.elementId, msg.state); break;
          case 'finished': setFinished(true); break;
          default: break;
        }
      },
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [ready, lessonId, applyStart, applyAppend]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const isTeacher = role === 'teacher';
  roleRef.current = role;
  const send = useCallback((m: Parameters<LessonSocket['send']>[0]) => socketRef.current?.send(m), []);

  const nav = (idx: number) => { if (isTeacher) send({ t: 'nav', sceneIndex: idx }); };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => undefined);
  };
  const mirrorSceneEvent = (event: AcademySceneRuntimeEvent) => {
    const { role: eventRole, ...wireEvent } = event;
    void eventRole;
    send({ t: 'scene-event', event: wireEvent });
  };

  const onDrawStart = (s: LessonStroke) => { applyStart(s); send({ t: 'draw-start', id: s.id, color: s.color, size: s.size, point: s.points[0] }); };
  const onDrawAppend = (id: string, points: LessonPoint[]) => { applyAppend(id, points); send({ t: 'draw-append', id, points }); };
  const onDrawEnd = (id: string) => send({ t: 'draw-end', id });
  const clearDraw = () => { setStrokes([]); send({ t: 'draw-clear' }); };

  const endLesson = async () => {
    if (!window.confirm('Завершить урок? Занятие будет отмечено проведённым.')) return;
    setEnding(true);
    try {
      await setLessonStatus({ id: lessonId, status: 'COMPLETED' }).unwrap();
      // Ученику показываем финал сразу, не дожидаясь его поллинга.
      send({ t: 'finish' });
      toast({ title: 'Урок завершён' });
      router.push('/teacher');
    } catch {
      toast({ title: 'Не удалось завершить урок', variant: 'destructive' });
      setEnding(false);
    }
  };

  const saveLink = async () => {
    try {
      await setMeetingLink({ id: lessonId, url: linkDraft.trim() }).unwrap();
      setEditingLink(false);
      toast({ title: 'Ссылка на видеозвонок сохранена' });
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось сохранить ссылку', description: msg, variant: 'destructive' });
    }
  };

  if (instanceQuery.isLoading) {
    return <div className="flex h-dvh items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  // Финал урока для ученика: по WS-событию от учителя либо по статусу занятия
  // (если ученик перезагрузил страницу уже после завершения).
  const lessonDone = ['COMPLETED', 'REPORT_SENT'].includes(instanceQuery.data?.lessonStatus ?? '');
  if (!isTeacher && (finished || lessonDone)) {
    return <LessonFinish lessonId={lessonId} />;
  }
  // Урок не подготовлен: ученик ждёт (автовход при готовности), преподаватель идёт готовить.
  if (!instanceQuery.data?.instance) {
    const asTeacher = instanceQuery.data?.viewerRole === 'teacher';
    return (
      <div className="academy-theme flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        {asTeacher ? (
          <>
            <p className="text-lg font-semibold">Урок ещё не подготовлен</p>
            <p className="max-w-sm text-sm text-muted-foreground">Выберите тему и шаблон урока в кабинете преподавателя, добавьте ссылку на видеозвонок — затем начните занятие.</p>
            <Link href="/teacher"><Button>Кабинет преподавателя</Button></Link>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-lg font-semibold">Ждём преподавателя</p>
            <p className="max-w-sm text-sm text-muted-foreground">Преподаватель готовит урок. Как только всё будет готово, вы войдёте автоматически — страницу можно не обновлять.</p>
            <Link href="/lessons"><Button variant="outline">К моим занятиям</Button></Link>
          </>
        )}
      </div>
    );
  }

  const scene = scenes[sceneIndex] ?? null;
  // Пропорции кадра сцены: по ним вписываем сцену и накладываем рисование.
  const sceneVp = (scene as { viewport?: { width?: number; height?: number } } | null)?.viewport;
  const sceneRatio = {
    w: Number(sceneVp?.width) > 0 ? Number(sceneVp?.width) : 1280,
    h: Number(sceneVp?.height) > 0 ? Number(sceneVp?.height) : 720,
  };

  return (
    <div ref={rootRef} className="academy-theme flex h-dvh flex-col bg-background text-foreground">
      {/* Шапка */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-semibold">{instanceQuery.data.instance.title}</span>
        <span className="text-xs text-muted-foreground">Сцена {sceneCount ? sceneIndex + 1 : 0} из {sceneCount}</span>
        <ConnectionBadge status={status} latencyMs={latencyMs} />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MeetingLink
            meetingUrl={meetingUrl}
            isTeacher={isTeacher}
            editing={editingLink}
            draft={linkDraft}
            saving={meetingState.isLoading}
            onEditStart={() => { setLinkDraft(meetingUrl ?? ''); setEditingLink(true); }}
            onDraftChange={setLinkDraft}
            onSave={saveLink}
            onCancel={() => setEditingLink(false)}
          />
          {isTeacher && (
            <Button size="sm" variant="outline" className="h-8" onClick={endLesson} disabled={ending}>
              {ending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1 h-3.5 w-3.5" />} Завершить урок
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label="Полный экран">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Link href={isTeacher ? '/teacher' : '/lessons'}><Button variant="ghost" size="icon" aria-label="Выйти"><LogOut className="h-4 w-4" /></Button></Link>
        </div>
      </div>

      {/* Профиль ребёнка: прогресс урока, уровень, достижения этого урока */}
      <ChildOverviewBar lessonId={lessonId} sceneIndex={sceneIndex} sceneCount={sceneCount} />

      {/* Тело: инструмент урока во всю ширину */}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-muted/40">
          {(scene as { lab?: unknown })?.lab ? (
            <LessonLab lessonId={lessonId} />
          ) : scene ? (
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Кадр сцены: рисование учителя и «Молодец!» привязаны именно к нему,
                  иначе после вписывания сцены штрихи уезжали относительно картинки. */}
              <div
                className="relative"
                style={{ aspectRatio: `${sceneRatio.w} / ${sceneRatio.h}`, width: '100%', maxWidth: '100%', maxHeight: '100%' }}
              >
              <AcademyScenePlayer
                ref={playerRef}
                onReady={() => {
                  for (const [id, state] of Object.entries(pendingGamesRef.current)) {
                    playerRef.current?.setGameState(id, state);
                  }
                }}
                onGameState={(elementId, state) => {
                  pendingGamesRef.current = { ...pendingGamesRef.current, [elementId]: state };
                  send({ t: 'game', elementId, state });
                }}
                scene={scene}
                role={role ?? 'student'}
                className="h-full w-full"
                onEvent={mirrorSceneEvent}
              />
              <DrawingCanvas
                strokes={strokes}
                active={isTeacher && penOn}
                color={penColor}
                size={4}
                onStart={onDrawStart}
                onAppend={onDrawAppend}
                onEnd={onDrawEnd}
              />
              {reward && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary/10">
                  <div className="animate-academy-in rounded-2xl bg-card px-6 py-4 text-center shadow-lg">
                    <div className="text-4xl">🎉</div>
                    <p className="mt-1 font-semibold text-primary">Молодец!</p>
                  </div>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {scenesQuery.isLoading ? 'Загружаем сцены…' : 'В уроке нет сцен'}
            </div>
          )}
        </div>

        {/* Панель управления учителя */}
        {isTeacher && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <Button variant="outline" size="sm" onClick={() => nav(sceneIndex - 1)} disabled={sceneIndex <= 0}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs text-muted-foreground">{sceneCount ? sceneIndex + 1 : 0}/{sceneCount}</span>
            <Button variant="outline" size="sm" onClick={() => nav(sceneIndex + 1)} disabled={sceneIndex >= sceneCount - 1}><ChevronRight className="h-4 w-4" /></Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant={unlocked ? 'default' : 'outline'} size="sm" onClick={() => send({ t: 'unlock', value: !unlocked })}>
              <Unlock className="mr-1 h-4 w-4" /> {unlocked ? 'Разблокировано' : 'Разблокировать'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => send({ t: 'reward' })}><Gift className="mr-1 h-4 w-4" /> Награда</Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button variant={penOn ? 'default' : 'outline'} size="sm" onClick={() => setPenOn((v) => !v)}><Pencil className="mr-1 h-4 w-4" /> Рисовать</Button>
            {penOn && LESSON_DRAW_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setPenColor(c)} aria-label={`Цвет ${c}`}
                className={cn('h-6 w-6 rounded-full border', penColor === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border')}
                style={{ backgroundColor: c }} />
            ))}
            <Button variant="ghost" size="sm" onClick={clearDraw}><Eraser className="mr-1 h-4 w-4" /> Стереть</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Шапка с профилем ребёнка: прогресс по сценам, уровень (XP-бар) и достижения этого урока. */
function ChildOverviewBar({ lessonId, sceneIndex, sceneCount }: { lessonId: string; sceneIndex: number; sceneCount: number }) {
  const { data } = useGetLessonChildOverviewQuery(lessonId, { pollingInterval: 15000 });
  if (!data) return null;
  const scenePercent = sceneCount ? Math.round(((sceneIndex + 1) / sceneCount) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-4 py-2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
          {data.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{data.name}</p>
          <p className="text-[11px] text-muted-foreground">Уровень {data.level} · 🔥 {data.streakCount}</p>
        </div>
      </div>

      <div className="min-w-[140px] flex-1">
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>Урок</span><span>{sceneCount ? sceneIndex + 1 : 0}/{sceneCount}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${scenePercent}%` }} />
        </div>
      </div>

      <div className="min-w-[140px] flex-1">
        <div className="mb-0.5 flex justify-between text-[11px] text-muted-foreground">
          <span>До уровня {data.level + 1}</span><span>{data.xpIntoLevel}/{data.xpIntoLevel + data.xpNeeded} XP</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${data.percent}%` }} />
        </div>
      </div>

      {data.achievements.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Награды:</span>
          {data.achievements.map((a, i) => (
            <span key={i} className="text-lg" title={a.title}>{a.icon}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Ссылка на видеозвонок (Яндекс Телемост): учитель добавляет/меняет, ученик открывает. */
function MeetingLink({
  meetingUrl, isTeacher, editing, draft, saving, onEditStart, onDraftChange, onSave, onCancel,
}: {
  meetingUrl: string | null;
  isTeacher: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  onEditStart: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  if (isTeacher && editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="https://telemost.yandex.ru/…"
          className="h-8 w-56 rounded-lg border border-border bg-background px-2 text-sm"
          autoFocus
        />
        <Button size="sm" className="h-8" onClick={onSave} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Сохранить'}</Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>Отмена</Button>
      </div>
    );
  }
  if (meetingUrl) {
    return (
      <div className="flex items-center gap-1.5">
        <a href={meetingUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" className="h-8"><Video className="mr-1 h-3.5 w-3.5" /> Открыть видеозвонок</Button>
        </a>
        {isTeacher && <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={onEditStart}>изменить</Button>}
      </div>
    );
  }
  if (isTeacher) {
    return (
      <Button size="sm" variant="outline" className="h-8" onClick={onEditStart}>
        <Video className="mr-1 h-3.5 w-3.5" /> Добавить ссылку на видеозвонок
      </Button>
    );
  }
  return <span className="text-xs text-muted-foreground">Видеозвонок появится, когда преподаватель добавит ссылку</span>;
}

/** Качество синхронизации урока: цвет и подпись по задержке round-trip. */
function ConnectionBadge({ status, latencyMs }: { status: 'connecting' | 'open' | 'closed'; latencyMs: number | null }) {
  if (status !== 'open') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full', status === 'connecting' ? 'animate-pulse bg-amber-500' : 'bg-destructive')} />
        {status === 'connecting' ? 'подключение…' : 'нет связи'}
      </span>
    );
  }
  const weak = latencyMs !== null && latencyMs > 400;
  const poor = latencyMs !== null && latencyMs > 1000;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', poor ? 'text-destructive' : weak ? 'text-amber-600' : 'text-emerald-700')}>
      <span className={cn('h-2 w-2 rounded-full', poor ? 'bg-destructive' : weak ? 'bg-amber-500' : 'bg-emerald-500')} />
      {poor ? 'связь слабая' : weak ? 'связь нестабильна' : 'на связи'}
    </span>
  );
}
