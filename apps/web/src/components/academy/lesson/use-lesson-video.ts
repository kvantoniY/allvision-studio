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
 * Ключевой принцип: при входе всегда подключаемся к комнате (даже с выключенными
 * устройствами), поэтому кнопки камеры/микрофона живые всегда, а не блокируются
 * до успешного медиа-соединения. Камера и микрофон — независимые toggle поверх
 * уже установленного соединения.
 */

export interface LessonVideoParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  videoTrack: Track | null;
  screenTrack: Track | null;
}

export type LessonVideoPhase = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'failed';

export interface DeviceOption {
  deviceId: string;
  label: string;
}

export interface JoinPrefs {
  camera: boolean;
  mic: boolean;
  cameraId?: string;
  micId?: string;
}

type TokenResponse =
  | { enabled: false }
  | { enabled: true; url: string; token: string; room: string };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useLessonVideo(lessonId: string) {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null — ещё не знаем
  const [phase, setPhase] = useState<LessonVideoPhase>('idle');
  const [participants, setParticipants] = useState<LessonVideoParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const [cameras, setCameras] = useState<DeviceOption[]>([]);
  const [mics, setMics] = useState<DeviceOption[]>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [activeMicId, setActiveMicId] = useState<string | null>(null);

  const tokenRef = useRef<{ url: string; token: string } | null>(null);
  const roomRef = useRef<Room | null>(null);
  const startingRef = useRef(false);
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

  /** Обновляет списки камер/микрофонов (лейблы доступны только после выдачи доступа). */
  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setCameras(list.filter((d) => d.kind === 'videoinput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'Камера' })));
      setMics(list.filter((d) => d.kind === 'audioinput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'Микрофон' })));
    } catch {
      /* без списка устройств переживём — останутся системные по умолчанию */
    }
  }, []);

  // Шаг 1: узнаём, включена ли видеосвязь, берём токен (без подключения).
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

  /** Включение камеры с повтором: сразу после освобождения превью ОС может отдать «занято». */
  const enableCameraWithRetry = useCallback(async (r: Room, deviceId?: string) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await r.localParticipant.setCameraEnabled(true, deviceId ? { deviceId } : undefined);
        return true;
      } catch {
        if (attempt === 0) await sleep(700);
      }
    }
    setError('Не удалось включить камеру — возможно, она занята другим приложением');
    return false;
  }, []);

  /** Подключение к комнате и включение выбранных устройств. */
  const connect = useCallback(async (prefs: JoinPrefs) => {
    if (startingRef.current || roomRef.current) return;
    const creds = tokenRef.current;
    if (!creds) { setError('Видеосвязь недоступна'); setPhase('failed'); return; }
    startingRef.current = true;
    setError(null);
    setPhase('connecting');
    setActiveCameraId(prefs.cameraId ?? null);
    setActiveMicId(prefs.micId ?? null);

    try {
      const { Room: RoomCtor } = await import('livekit-client');
      const options: RoomOptions = {
        adaptiveStream: true,
        dynacast: true,
        // Не рвать сессию при кратком уходе вкладки в фон (мобильные браузеры часто
        // шлют pagehide/visibilitychange — например при системном промпте доступа).
        disconnectOnPageLeave: false,
        videoCaptureDefaults: prefs.cameraId ? { deviceId: prefs.cameraId } : undefined,
        audioCaptureDefaults: prefs.micId ? { deviceId: prefs.micId } : undefined,
      };
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
        .on(RoomEvent.MediaDevicesChanged, () => { void refreshDevices(); })
        .on(RoomEvent.Reconnecting, () => setPhase('reconnecting'))
        .on(RoomEvent.Reconnected, () => { setPhase('connected'); refresh(); })
        .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
          roomRef.current = null;
          startingRef.current = false;
          if (reason === DisconnectReason.DUPLICATE_IDENTITY) setError('Урок открыт в другом окне');
          setPhase('failed');
        })
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Connected) setPhase('connected');
        });

      await r.connect(creds.url, creds.token);
      // Соединение установлено — кнопки уже рабочие, даже если устройства не включатся.
      setPhase('connected');
      startingRef.current = false;

      if (prefs.mic) {
        await r.localParticipant.setMicrophoneEnabled(true, prefs.micId ? { deviceId: prefs.micId } : undefined)
          .catch(() => setError('Не удалось включить микрофон — проверьте доступ в браузере'));
      }
      if (prefs.camera) {
        await enableCameraWithRetry(r, prefs.cameraId);
      }

      setNeedsAudioUnlock(!r.canPlaybackAudio);
      void refreshDevices();
      snapshot(r);
    } catch {
      roomRef.current = null;
      startingRef.current = false;
      setError('Не удалось подключиться к видеосвязи');
      setPhase('failed');
    }
  }, [snapshot, attachAudio, detachAudio, enableCameraWithRetry, refreshDevices]);

  const retry = useCallback(async (prefs: JoinPrefs) => {
    const r = roomRef.current;
    if (r) { await r.disconnect().catch(() => undefined); roomRef.current = null; }
    startingRef.current = false;
    setPhase('idle');
    await connect(prefs);
  }, [connect]);

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
      await r.localParticipant.setMicrophoneEnabled(!r.localParticipant.isMicrophoneEnabled, activeMicId ? { deviceId: activeMicId } : undefined);
      snapshot(r);
    } catch {
      setError('Нет доступа к микрофону');
    }
  }, [snapshot, activeMicId]);

  const toggleCamera = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    if (r.localParticipant.isCameraEnabled) {
      await r.localParticipant.setCameraEnabled(false).catch(() => undefined);
      snapshot(r);
    } else {
      await enableCameraWithRetry(r, activeCameraId ?? undefined);
      snapshot(r);
    }
  }, [snapshot, enableCameraWithRetry, activeCameraId]);

  const toggleScreenShare = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.localParticipant.setScreenShareEnabled(!r.localParticipant.isScreenShareEnabled, { audio: true });
      snapshot(r);
    } catch {
      snapshot(r);
    }
  }, [snapshot]);

  /** Смена активной камеры на лету (шестерёнка в уроке). */
  const switchCamera = useCallback(async (deviceId: string) => {
    setActiveCameraId(deviceId);
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.switchActiveDevice('videoinput', deviceId);
      snapshot(r);
    } catch {
      setError('Не удалось переключить камеру');
    }
  }, [snapshot]);

  const switchMic = useCallback(async (deviceId: string) => {
    setActiveMicId(deviceId);
    const r = roomRef.current;
    if (!r) return;
    try {
      await r.switchActiveDevice('audioinput', deviceId);
      snapshot(r);
    } catch {
      setError('Не удалось переключить микрофон');
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
    cameras,
    mics,
    activeCameraId,
    activeMicId,
    connect,
    retry,
    unlockAudio,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    switchCamera,
    switchMic,
    refreshDevices,
  };
}
