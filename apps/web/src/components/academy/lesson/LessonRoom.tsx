'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft, ChevronRight, Eraser, Gift, Loader2, LogOut, Maximize2, Mic, MicOff,
  Minimize2, Monitor, MonitorOff, Pencil, RefreshCw, Send, Unlock, Video, VideoOff,
} from 'lucide-react';
import {
  EMPTY_PARTICIPANT_STATE,
  LESSON_DRAW_COLORS,
  type AcademySceneRuntimeEvent,
  type LessonChatEntry,
  type LessonParticipantState,
  type LessonPoint,
  type LessonPresence,
  type LessonRole,
  type LessonServerMessage,
  type LessonStroke,
} from '@allvision/shared';
import { AcademyScenePlayer, type AcademyScenePlayerHandle } from '@/components/academy/scene-player';
import { DrawingCanvas } from '@/components/academy/lesson/DrawingCanvas';
import { LessonPreJoin } from '@/components/academy/lesson/LessonPreJoin';
import { VideoTile } from '@/components/academy/lesson/VideoTile';
import { useLessonVideo, type JoinPrefs, type LessonVideoPhase } from '@/components/academy/lesson/use-lesson-video';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { connectLessonSocket, type LessonSocket } from '@/lib/lesson-socket';
import { useGetInstanceByLessonQuery, useGetInstanceScenesQuery } from '@/store/api/academy-lesson-instances-api';

type UseLessonVideo = ReturnType<typeof useLessonVideo>;

export function LessonRoom({ lessonId }: { lessonId: string }) {
  const instanceQuery = useGetInstanceByLessonQuery(lessonId);
  const instanceId = instanceQuery.data?.instance?.id;
  const scenesQuery = useGetInstanceScenesQuery(instanceId ?? '', { skip: !instanceId });

  const video = useLessonVideo(lessonId);

  const [role, setRole] = useState<LessonRole | null>(null);
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [sceneCount, setSceneCount] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const [presence, setPresence] = useState<LessonPresence>({
    teacher: { ...EMPTY_PARTICIPANT_STATE },
    student: { ...EMPTY_PARTICIPANT_STATE },
  });
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [chatFocused, setChatFocused] = useState(false);
  const [strokes, setStrokes] = useState<LessonStroke[]>([]);
  const [chat, setChat] = useState<LessonChatEntry[]>([]);
  const [reward, setReward] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Прошёл ли пользователь пред-вход (проверку устройств). Видеосвязь выключена
  // на сервере → пред-вход не нужен, сразу в комнату.
  const [joined, setJoined] = useState(false);
  const prejoinKey = `lesson-prejoin-${lessonId}`;
  const autoJoined = useRef(false);

  const [penOn, setPenOn] = useState(false);
  const [penColor, setPenColor] = useState<string>(LESSON_DRAW_COLORS[0]);

  const socketRef = useRef<LessonSocket | null>(null);
  const playerRef = useRef<AcademyScenePlayerHandle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [chatInput, setChatInput] = useState('');

  const scenes = useMemo(() => scenesQuery.data?.scenes ?? [], [scenesQuery.data]);

  const applyStart = useCallback((s: LessonStroke) => setStrokes((p) => [...p, s]), []);
  const applyAppend = useCallback((id: string, points: LessonPoint[]) => {
    setStrokes((p) => p.map((s) => (s.id === id ? { ...s, points: [...s.points, ...points] } : s)));
  }, []);

  // Видеосвязь выключена на сервере — пред-вход пропускаем.
  const videoGate = video.enabled === true && !joined;
  const ready = video.enabled !== null && !videoGate;

  const doJoin = useCallback((prefs: JoinPrefs) => {
    sessionStorage.setItem(prejoinKey, JSON.stringify(prefs));
    setJoined(true);
    void video.start(prefs);
  }, [prejoinKey, video]);

  const skipVideo = useCallback(() => {
    sessionStorage.setItem(prejoinKey, JSON.stringify({ camera: false, mic: false, skipped: true }));
    setJoined(true);
  }, [prejoinKey]);

  // Перезагрузка страницы: если уже проходили пред-вход — возвращаемся в урок
  // с прежним выбором устройств, не спрашивая заново.
  useEffect(() => {
    if (video.enabled !== true || joined || autoJoined.current) return;
    const saved = sessionStorage.getItem(prejoinKey);
    if (!saved) return;
    autoJoined.current = true;
    try {
      const prefs = JSON.parse(saved) as JoinPrefs & { skipped?: boolean };
      setJoined(true);
      if (!prefs.skipped) void video.start({ camera: prefs.camera, mic: prefs.mic });
    } catch {
      setJoined(true);
    }
  }, [video.enabled, joined, prejoinKey, video]);

  // Подключение к комнате урока (WebSocket) — только после входа.
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
            setPresence(msg.state.presence);
            setStrokes(msg.state.strokes);
            setChat(msg.chat);
            break;
          case 'nav': setSceneIndex(msg.sceneIndex); setStrokes(msg.strokes); break;
          case 'unlock': setUnlocked(msg.value); break;
          case 'draw-start': applyStart({ id: msg.id, color: msg.color, size: msg.size, points: [msg.point] }); break;
          case 'draw-append': applyAppend(msg.id, msg.points); break;
          case 'draw-clear': setStrokes([]); break;
          case 'reward': setReward(true); setTimeout(() => setReward(false), 2600); break;
          case 'chat': setChat((p) => [...p, msg.entry]); break;
          case 'presence': setPresence(msg.presence); break;
          case 'scene-event': playerRef.current?.send({ ...msg.event, role: msg.from }); break;
          default: break;
        }
      },
    });
    socketRef.current = socket;
    return () => socket.close();
  }, [ready, lessonId, applyStart, applyAppend]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ block: 'end' }); }, [chat]);
  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const isTeacher = role === 'teacher';
  const send = useCallback((m: Parameters<LessonSocket['send']>[0]) => socketRef.current?.send(m), []);

  // Индикаторы участника берём из LiveKit (микрофон и речь) и шлём в presence.
  useEffect(() => { send({ t: 'status', micOn: video.micEnabled }); }, [video.micEnabled, send]);
  useEffect(() => { send({ t: 'status', speaking: video.localSpeaking }); }, [video.localSpeaking, send]);

  // Активна ли вкладка урока — собеседник видит, что человек отвлёкся.
  useEffect(() => {
    if (!ready) return;
    const report = () => send({ t: 'status', focused: document.visibilityState === 'visible' && document.hasFocus() });
    report();
    document.addEventListener('visibilitychange', report);
    window.addEventListener('focus', report);
    window.addEventListener('blur', report);
    return () => {
      document.removeEventListener('visibilitychange', report);
      window.removeEventListener('focus', report);
      window.removeEventListener('blur', report);
    };
  }, [send, ready]);

  useEffect(() => { send({ t: 'status', inChat: chatFocused }); }, [chatFocused, send]);

  const nav = (idx: number) => { if (isTeacher) send({ t: 'nav', sceneIndex: idx }); };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen().catch(() => undefined);
  };
  const sendChat = () => {
    const body = chatInput.trim();
    if (!body) return;
    send({ t: 'chat', body });
    setChatInput('');
  };
  const mirrorSceneEvent = (event: AcademySceneRuntimeEvent) => {
    const { role: eventRole, ...wireEvent } = event;
    void eventRole;
    send({ t: 'scene-event', event: wireEvent });
  };

  // Рисование (учитель).
  const onDrawStart = (s: LessonStroke) => { applyStart(s); send({ t: 'draw-start', id: s.id, color: s.color, size: s.size, point: s.points[0] }); };
  const onDrawAppend = (id: string, points: LessonPoint[]) => { applyAppend(id, points); send({ t: 'draw-append', id, points }); };
  const onDrawEnd = (id: string) => send({ t: 'draw-end', id });
  const clearDraw = () => { setStrokes([]); send({ t: 'draw-clear' }); };

  const retryVideo = () => {
    const saved = sessionStorage.getItem(prejoinKey);
    let prefs: JoinPrefs = { camera: true, mic: true };
    try { if (saved) { const p = JSON.parse(saved); prefs = { camera: !!p.camera, mic: !!p.mic }; } } catch { /* дефолт */ }
    void video.retry(prefs);
  };

  if (instanceQuery.isLoading || video.enabled === null) {
    return <div className="flex h-dvh items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!instanceQuery.data?.instance) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <p className="text-lg font-semibold">Урок ещё не подготовлен</p>
        <p className="max-w-sm text-sm text-muted-foreground">Преподаватель должен выбрать шаблон урока в своём кабинете, прежде чем начинать занятие.</p>
        <Link href="/"><Button variant="outline">На главную</Button></Link>
      </div>
    );
  }

  // Пред-вход: проверка камеры/микрофона до входа в урок.
  if (videoGate) {
    return <LessonPreJoin title={instanceQuery.data.instance.title} onJoin={doJoin} onSkip={skipVideo} />;
  }

  const scene = scenes[sceneIndex] ?? null;
  const usingVideo = video.enabled === true;

  return (
    <div ref={rootRef} className="academy-theme flex h-dvh flex-col bg-background text-foreground">
      {/* Шапка */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-semibold">{instanceQuery.data.instance.title}</span>
        <span className="text-xs text-muted-foreground">Сцена {sceneCount ? sceneIndex + 1 : 0} из {sceneCount}</span>
        <ConnectionBadge status={status} latencyMs={latencyMs} />
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <PresenceChip label="Учитель" state={presence.teacher} />
          <PresenceChip label="Ученик" state={presence.student} />
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} aria-label="Полный экран">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Link href={isTeacher ? '/teacher' : '/lessons'}><Button variant="ghost" size="icon" aria-label="Выйти"><LogOut className="h-4 w-4" /></Button></Link>
        </div>
      </div>

      {/* Тело */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Сцена */}
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-muted/40">
            {scene ? (
              <div className="absolute inset-0">
                <AcademyScenePlayer
                  ref={playerRef}
                  scene={scene}
                  role={role ?? 'student'}
                  className="h-full"
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

        {/* Правая колонка: видео + чат */}
        <div className="flex min-h-0 w-full flex-col gap-3 border-t border-border p-3 lg:w-[340px] lg:border-l lg:border-t-0">
          {usingVideo ? (
            <VideoPanel video={video} role={role} onRetry={retryVideo} />
          ) : (
            <PresenceOnlyPanel presence={presence} role={role} />
          )}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">Чат урока</span>
              {role && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className={cn('h-1.5 w-1.5 rounded-full', presence[role === 'teacher' ? 'student' : 'teacher'].inChat ? 'bg-emerald-500' : 'bg-muted-foreground/30')} />
                  {presence[role === 'teacher' ? 'student' : 'teacher'].inChat ? 'собеседник в чате' : 'собеседник не в чате'}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {chat.length === 0 && <p className="text-xs text-muted-foreground">Сообщений пока нет.</p>}
              {chat.map((m) => (
                <div key={m.id} className={cn('max-w-[85%] rounded-xl px-3 py-1.5 text-sm', m.role === role ? 'ml-auto bg-primary text-primary-foreground' : 'bg-muted')}>
                  {m.authorName && m.role !== role && <span className="mb-0.5 block text-[10px] opacity-70">{m.authorName}</span>}
                  {m.body}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="flex gap-2 border-t border-border p-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                onFocus={() => setChatFocused(true)}
                onBlur={() => setChatFocused(false)}
                placeholder="Сообщение…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <Button size="icon" onClick={sendChat} aria-label="Отправить"><Send className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Качество связи с комнатой урока: цвет и подпись по задержке round-trip. */
function ConnectionBadge({ status, latencyMs }: { status: 'connecting' | 'open' | 'closed'; latencyMs: number | null }) {
  if (status !== 'open') {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span className={cn('h-2 w-2 rounded-full', status === 'connecting' ? 'animate-pulse bg-amber-500' : 'bg-destructive')} />
        {status === 'connecting' ? 'подключение…' : 'нет связи'}
      </span>
    );
  }
  const weak = latencyMs !== null && latencyMs > 400;
  const poor = latencyMs !== null && latencyMs > 1000;
  return (
    <span className={cn('ml-2 inline-flex items-center gap-1 text-xs', poor ? 'text-destructive' : weak ? 'text-amber-600' : 'text-emerald-700')}>
      <span className={cn('h-2 w-2 rounded-full', poor ? 'bg-destructive' : weak ? 'bg-amber-500' : 'bg-emerald-500')} />
      {poor ? 'связь слабая' : weak ? 'связь нестабильна' : 'на связи'}
      {latencyMs !== null && <span className="opacity-60">{latencyMs} мс</span>}
    </span>
  );
}

/** Компактный статус участника в шапке: онлайн, вкладка, чат, микрофон. */
function PresenceChip({ label, state }: { label: string; state: LessonParticipantState }) {
  const title = state.online
    ? [state.focused ? 'вкладка активна' : 'вкладка свёрнута', state.inChat ? 'в чате' : null, state.micOn ? 'микрофон включён' : null]
        .filter(Boolean)
        .join(' · ')
    : 'не подключён';
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          !state.online ? 'bg-muted-foreground/30' : state.focused ? 'bg-emerald-500' : 'bg-amber-500',
        )}
      />
      {label}
      {state.online && !state.focused && <span className="opacity-60">отвлёкся</span>}
      {state.speaking && <Mic className="h-3 w-3 text-primary" />}
    </span>
  );
}

const VIDEO_PHASE_TEXT: Record<LessonVideoPhase, string> = {
  idle: 'Готовимся…',
  connecting: 'Подключаемся к видеосвязи…',
  connected: 'Видеосвязь активна',
  reconnecting: 'Связь прервалась, восстанавливаем…',
  failed: 'Видеосвязь потеряна',
};

/** Реальная видеосвязь LiveKit. */
function VideoPanel({ video, role, onRetry }: { video: UseLessonVideo; role: LessonRole | null; onRetry: () => void }) {
  const selfRole: LessonRole = role ?? 'student';
  const otherRole: LessonRole = selfRole === 'teacher' ? 'student' : 'teacher';
  const nameOf = (r: LessonRole) => (r === 'teacher' ? 'Учитель' : 'Ученик');

  const local = video.participants.find((p) => p.isLocal) ?? null;
  const remote = video.participants.find((p) => !p.isLocal) ?? null;

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        <VideoTile participant={local} label={`Вы · ${nameOf(selfRole)}`} />
        <VideoTile participant={remote} label={nameOf(otherRole)} />
      </div>

      {/* Явный статус подключения видеосвязи. */}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px]">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            video.phase === 'connected' ? 'bg-emerald-500'
              : video.phase === 'reconnecting' || video.phase === 'connecting' ? 'animate-pulse bg-amber-500'
                : video.phase === 'failed' ? 'bg-destructive' : 'bg-muted-foreground/40',
          )}
        />
        <span className={cn(video.phase === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
          {video.error ?? (video.phase === 'connected' && !remote ? 'Ждём собеседника' : VIDEO_PHASE_TEXT[video.phase])}
        </span>
      </div>

      {video.phase === 'failed' && (
        <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Переподключиться
        </Button>
      )}

      {video.needsAudioUnlock && (
        <Button size="sm" className="mt-2 w-full" onClick={() => void video.unlockAudio()}>
          Включить звук собеседника
        </Button>
      )}

      <div className="mt-2 flex items-center justify-center gap-2">
        <Button
          variant={video.micEnabled ? 'default' : 'outline'}
          size="icon"
          disabled={video.phase !== 'connected'}
          onClick={() => void video.toggleMic()}
          aria-label={video.micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {video.micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </Button>
        <Button
          variant={video.cameraEnabled ? 'default' : 'outline'}
          size="icon"
          disabled={video.phase !== 'connected'}
          onClick={() => void video.toggleCamera()}
          aria-label={video.cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
        >
          {video.cameraEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
        </Button>
        <Button
          variant={video.screenEnabled ? 'default' : 'outline'}
          size="icon"
          disabled={video.phase !== 'connected'}
          onClick={() => void video.toggleScreenShare()}
          aria-label={video.screenEnabled ? 'Остановить демонстрацию' : 'Показать экран'}
        >
          {video.screenEnabled ? <MonitorOff className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

/** Видеосвязь не настроена на сервере — показываем только присутствие по WebSocket. */
function PresenceOnlyPanel({ presence, role }: { presence: LessonPresence; role: LessonRole | null }) {
  const selfRole: LessonRole = role ?? 'student';
  const otherRole: LessonRole = selfRole === 'teacher' ? 'student' : 'teacher';
  const nameOf = (r: LessonRole) => (r === 'teacher' ? 'Учитель' : 'Ученик');
  const tile = (label: string, state: LessonParticipantState) => (
    <div className={cn('relative flex aspect-video items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground', state.speaking ? 'ring-2 ring-primary' : 'ring-1 ring-border')}>
      <VideoOff className="h-5 w-5 opacity-40" />
      <span className="absolute bottom-1 left-1.5 flex items-center gap-1">
        <span className={cn('h-1.5 w-1.5 rounded-full', state.online ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        {label}
      </span>
    </div>
  );
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="grid grid-cols-2 gap-2">
        {tile(`Вы · ${nameOf(selfRole)}`, presence[selfRole])}
        {tile(nameOf(otherRole), presence[otherRole])}
      </div>
      <p className="mt-2 text-center text-[10px] text-muted-foreground">Видеосвязь недоступна — идут сцена, рисование и чат</p>
    </div>
  );
}
