'use client';

type EpisodeVideoPlayerProps = {
  src?: string | null;
  poster?: string | null;
  watermarkRemoved?: boolean;
};

export function EpisodeVideoPlayer({ src, poster, watermarkRemoved }: EpisodeVideoPlayerProps) {
  if (!src) {
    return (
      <div className="grid aspect-video place-items-center rounded-md bg-slate-900 text-sm text-slate-500">
        Видео пока недоступно
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-md border border-slate-800 bg-black">
      <video
        src={src}
        poster={poster ?? undefined}
        controls
        playsInline
        className="aspect-video w-full bg-black"
      />
      {!watermarkRemoved && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-slate-950/70 px-3 py-1.5 text-xs font-semibold text-white shadow">
          Allvision Studio
        </div>
      )}
    </div>
  );
}
