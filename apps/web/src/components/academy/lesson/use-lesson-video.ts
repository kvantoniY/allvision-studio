'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
  DisconnectReason,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
  type RemoteParticipant,
  type Room,
  type RoomOptions,
} from 'livekit-client';

/**
 * Видеосвязь урока (A8) поверх self-hosted LiveKit.
 * Токен выдаёт наш API на конкретную комнату урока; ключи на клиент не попадают.
 *
 * Поток: сначала fetch токена → `enabled`. Подключение НЕ автоматическое —
 * его запускает пред-вход (green room) вызовом `start()` с выбранными
 * устройствами, чтобы камера/микрофон включались сразу и осознанно.
 */

export interface LessonVideoParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  /** Видеодорожка камеры для отрисовки. */
  videoTrack: Track | null;
  /** Демонстрация экрана (приоритетнее камеры при показе). */
  screenTrack: Track | null;
}

/** Фаза видеосвязи для явной индикации в интерфейсе. */
export type LessonVideoPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface JoinPrefs {
  camera: boolean;
  mic: boolean;
}

type TokenResponse =
  | { enabled: false }
  | { enabled: true; url: string; token: string; room: string };

export function useLessonVideo(lessonId: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null — ещё не знаем
  const [phase, setPhase] = useState<LessonVideoPhase>('idle');
  const [participants, setParticipants] = useState<LessonVideoParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  /** Браузер заблокировал автовоспроизведение звука — нужен клик пользователя. */
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  const tokenRef = useRef<{ url: string; token: string } | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startingRef = useRef(false);
  // Скрытые <audio> для дорожек собеседника: без них видео есть, а звука нет.
  const audioElements = useRef(new Map<string, HTMLAudioElement>());

  const snapshot = useCallback((r: Room) => {
    const toDto = (p: Participant, isLocal: boolean): LessonVideoParticipant => ({
      identity: p.identity,
      name: p.name || p.identity,
      isLocal,
      isSpeaking: p.isSpeaking,
      micEnabled: p.isMicrophoneEnabled,
      cameraEnabled: p.isCameraEnabled,
      videoTrack: p.getTrackPublication(Track.Source.Camera)?.track ?? null,
      screenTrack: p.getTrackPublication(Track.Source.ScreenShare)?.track ?? null,
    });
    const remote = [...r.remoteParticipants.values()].map((p: RemoteParticipant) => toDto(p, false));
    setParticipants([toDto(r.localParticipant, true), ...remote]);
    setMicEnabled(r.localParticipant.isMicrophoneEnabled);
    setCameraEnabled(r.localParticipant.isCameraEnabled);
    setScreenEnabled(r.localParticipant.isScreenShareEnabled);
    setLocalSpeaking(r.localParticipant.isSpeaking);
  }, []);

  // Шаг 1: узнаём, включена ли видеосвязь на сервере, и берём токен (без подключения).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/academy/lessons/${lessonId}/video-token`, { credentials: 'include' });
        if (!res.ok) throw new Error('token');
        const data = (await res.json()) as TokenResponse;
        if (cancelled) return;
        if (!data.enabled) { setEnabled(false); return; }
        tokenRef.current = { url: data.url, token: data.token };
        setEnabled(true);
      } catch {
        if (!cancelled) { setEnabled(false); setError('Видеосвязь недоступна'); }
      }
    })();
    return () => { cancelled = true; };
  }, [lessonId]);

  const attachAudio = useCallback((track: Track, id: string) => {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach() as HTMLAudioElement;
    el.style.display = 'none';
    document.body.appendChild(el);
    audioElements.current.set(id, el);
  }, []);

  const detachAudio = useCallback((track: Track, id: string) => {
    if (track.kind !== Track.Kind.Audio) return;
    track.detach().forEach((el) => el.remove());
    audioElements.current.delete(id);
  }, []);

  /** Шаг 2: подключение к комнате и включение выбранных устройств. */
  const start = useCallback(async (prefs: JoinPrefs) => {
    if (startingRef.current || roomRef.current) return;
    const creds = tokenRef.current;
    if (!creds) { setError('Видеосвязь недоступна'); setPhase('failed'); return; }
    startingRef.current = true;
    setError(null);
    setPhase('connecting');

    try {
      const { Room: RoomCtor } = await import('livekit-client');
      const options: RoomOptions = { adaptiveStream: true, dynacast: true };
      const r = new RoomCtor(options);
      roomRef.current = r;

      const refresh = () => snapshot(r);
      r
        .on(RoomEvent.ParticipantConnected, refresh)
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
          attachAudio(track, `${participant.identity}:${pub.trackSid}`);
          refresh();
        })
        .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
          detachAudio(track, `${participant.identity}:${pub.trackSid}`);
          refresh();
        })
        .on(RoomEvent.AudioPlaybackStatusChanged, () => setNeedsAudioUnlock(!r.canPlaybackAudio))
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.LocalTrackPublished, (_pub: LocalTrackPublication) => refresh())
        .on(RoomEvent.LocalTrackUnpublished, refresh)
        .on(RoomEvent.ActiveSpeakersChanged, refresh)
        .on(RoomEvent.Reconnecting, () => setPhase('reconnecting'))
        .on(RoomEvent.Reconnected, () => { setPhase('connected'); refresh(); })
        .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          roomRef.current = null;
          startingRef.current = false;
          // DUPLICATE_IDENTITY — второй вход тем же пользователем (перезагрузка/вторая вкладка).
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
            setError('Урок открыт в другом окне');
          }
          setPhase('failed');
        })
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Connected) setPhase('connected');
        });

      await r.connect(creds.url, creds.token);

      // Включаем устройства сразу после входа — пользователь видит себя без лишних кликов.
      // Камера и микрофон включаются раздельно: отказ по одному не блокирует второй.
      if (prefs.mic) {
        await r.localParticipant.setMicrophoneEnabled(true).catch(() => {
          setError('Не удалось включить микрофон — проверьте доступ в браузере');
        });
      }
      if (prefs.camera) {
        await r.localParticipant.setCameraEnabled(true).catch(() => {
          setError('Не удалось включить камеру — проверьте доступ в браузере');
        });
      }

      setPhase('connected');
      setNeedsAudioUnlock(!r.canPlaybackAudio);
      snapshot(r);
    } catch {
      roomRef.current = null;
      startingRef.current = false;
      setError('Не удалось подключиться к видеосвязи');
      setPhase('failed');
    } finally {
      startingRef.current = false;
    }
  }, [snapshot, attachAudio, detachAudio]);

  /** Повторная попытка после разрыва (кнопка «Переподключиться»). */
  const retry = useCallback(async (prefs: JoinPrefs) => {
    const r = roomRef.current;
    if (r) { await r.disconnect().catch(() => undefined); roomRef.current = null; }
    startingRef.current = false;
    setPhase('idle');
    await start(prefs);
  }, [start]);

  // Отключение при уходе со страницы.
  useEffect(() => {
    const audioMap = audioElements.current;
    return () => {
      audioMap.forEach((el) => el.remove());
      audioMap.clear();
      void roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  const unlockAudio = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    await r.startAudio().catch(() => undefined);
    setNeedsAudioUnlock(!r.canPlaybackAudio);
  }, []);

  const toggleMic = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setMicrophoneEnabled(!r.localParticipant.isMicrophoneEnabled);
      snapshot(r);
    } catch {
      setError('Нет доступа к микрофону');
    }
  }, [snapshot]);

  const toggleCamera = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setCameraEnabled(!r.localParticipant.isCameraEnabled);
      snapshot(r);
    } catch {
      setError('Нет доступа к камере');
    }
  }, [snapshot]);

  const toggleScreenShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try {
      // Звук вкладки берём вместе с картинкой — иначе видео в демонстрации немое.
      await r.localParticipant.setScreenShareEnabled(!r.localParticipant.isScreenShareEnabled, { audio: true });
      snapshot(r);
    } catch {
      // Пользователь просто закрыл системный диалог выбора экрана — не ошибка.
      snapshot(r);
    }
  }, [snapshot]);

  return {
    enabled,
    phase,
    participants,
    error,
    micEnabled,
    cameraEnabled,
    screenEnabled,
    localSpeaking,
    needsAudioUnlock,
    start,
    retry,
    unlockAudio,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}
