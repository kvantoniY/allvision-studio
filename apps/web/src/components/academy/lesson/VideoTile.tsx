'use client';

import { useEffect, useRef } from 'react';
import { Mic, MicOff, VideoOff } from 'lucide-react';
import type { Track } from 'livekit-client';
import { cn } from '@/lib/utils';
import type { LessonVideoParticipant } from './use-lesson-video';

/**
 * Плитка участника видеосвязи: рамка подсвечивается, когда человек говорит.
 * Локальное видео зеркалим и глушим (иначе эхо от собственного микрофона).
 */
export function VideoTile({
  participant,
  label,
  className,
}: {
  participant: LessonVideoParticipant | null;
  label: string;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const track: Track | null = participant?.screenTrack ?? participant?.videoTrack ?? null;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);

  const speaking = participant?.isSpeaking ?? false;

  return (
    <div
      className={cn(
        'relative flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-muted text-xs text-muted-foreground transition',
        speaking ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : 'ring-1 ring-border',
        className,
      )}
    >
      {track ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant?.isLocal}
          className={cn('h-full w-full object-cover', participant?.isLocal && !participant.screenTrack && 'scale-x-[-1]')}
        />
      ) : (
        <VideoOff className="h-5 w-5 opacity-40" />
      )}
      <span className="absolute bottom-1 left-1.5 flex items-center gap-1 rounded bg-background/70 px-1.5 py-0.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', participant ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        {label}
        {participant?.screenTrack && <span className="text-primary">экран</span>}
      </span>
      <span className="absolute bottom-1 right-1.5 rounded bg-background/70 px-1 py-0.5">
        {participant?.micEnabled ? <Mic className="h-3 w-3 text-primary" /> : <MicOff className="h-3 w-3 opacity-40" />}
      </span>
    </div>
  );
}
