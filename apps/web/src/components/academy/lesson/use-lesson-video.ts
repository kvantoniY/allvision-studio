'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectionState,
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
 */

export interface LessonVideoParticipant {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  /** Видеодорожка для отрисовки: камера либо демонстрация экрана. */
  videoTrack: Track | null;
  screenTrack: Track | null;
}

type TokenResponse =
  | { enabled: false }
  | { enabled: true; url: string; token: string; room: string };

export function useLessonVideo(lessonId: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null); // null — ещё не знаем
  const [connection, setConnection] = useState<ConnectionState>(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<LessonVideoParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  /** Браузер заблокировал автовоспроизведение звука — нужен клик пользователя. */
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);
  const roomRef = useRef<Room | null>(null);
  // Скрытые <audio> для дорожек собеседника: без них видео есть, а звука нет.
  const audioElements = useRef(new Map<string, HTMLAudioElement>());

  const snapshot = useCallback((r: Room) => {
    const toDto = (p: Participant, isLocal: boolean): LessonVideoParticipant => {
      const camera = p.getTrackPublication(Track.Source.Camera)?.track ?? null;
      const screen = p.getTrackPublication(Track.Source.ScreenShare)?.track ?? null;
      return {
        identity: p.identity,
        name: p.name || p.identity,
        isLocal,
        isSpeaking: p.isSpeaking,
        micEnabled: p.isMicrophoneEnabled,
        cameraEnabled: p.isCameraEnabled,
        videoTrack: camera,
        screenTrack: screen,
      };
    };
    const remote = [...r.remoteParticipants.values()].map((p: RemoteParticipant) => toDto(p, false));
    setParticipants([toDto(r.localParticipant, true), ...remote]);
    setMicEnabled(r.localParticipant.isMicrophoneEnabled);
    setCameraEnabled(r.localParticipant.isCameraEnabled);
    setScreenEnabled(r.localParticipant.isScreenShareEnabled);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let active: Room | null = null;

    const connect = async () => {
      try {
        const res = await fetch(`/api/academy/lessons/${lessonId}/video-token`, { credentials: 'include' });
        if (!res.ok) throw new Error('token');
        const data = (await res.json()) as TokenResponse;
        if (cancelled) return;
        if (!data.enabled) { setEnabled(false); return; }
        setEnabled(true);

        // Импорт клиента только когда связь реально включена — не тянем SFU-код в бандл страницы зря.
        const { Room: RoomCtor } = await import('livekit-client');
        const options: RoomOptions = {
          adaptiveStream: true, // подстройка качества под размер плитки и канал
          dynacast: true,
        };
        const r = new RoomCtor(options);
        active = r;
        roomRef.current = r;

        const refresh = () => snapshot(r);
        const attachAudio = (track: Track, id: string) => {
          if (track.kind !== Track.Kind.Audio) return;
          const el = track.attach() as HTMLAudioElement;
          el.style.display = 'none';
          document.body.appendChild(el);
          audioElements.current.set(id, el);
        };
        const detachAudio = (track: Track, id: string) => {
          if (track.kind !== Track.Kind.Audio) return;
          track.detach().forEach((el) => el.remove());
          audioElements.current.delete(id);
        };

        r
          .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => setConnection(state))
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
          .on(RoomEvent.ActiveSpeakersChanged, refresh);

        await r.connect(data.url, data.token);
        if (cancelled) { await r.disconnect(); return; }
        setRoom(r);
        refresh();
      } catch {
        if (!cancelled) {
          setEnabled(false);
          setError('Не удалось подключиться к видеосвязи');
        }
      }
    };
    void connect();

    const audioMap = audioElements.current;
    return () => {
      cancelled = true;
      roomRef.current = null;
      audioMap.forEach((el) => el.remove());
      audioMap.clear();
      void active?.disconnect();
    };
  }, [lessonId, snapshot]);

  /** Разблокировка звука после жеста пользователя (политика автоплея браузера). */
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
    room,
    enabled,
    connection,
    participants,
    error,
    micEnabled,
    cameraEnabled,
    screenEnabled,
    needsAudioUnlock,
    unlockAudio,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
  };
}
