'use client';

import { useMemo, useState } from 'react';
import { Image as ImageIcon, Loader2, Search, Upload, Video } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { mediaUrl } from '@/components/editor/canvas/useMediaElements';
import { useListUserMediaAssetsQuery, type UserMediaAsset } from '@/store/api/user-media-assets-api';
import { cn } from '@/lib/utils';

/**
 * Личная медиатека редактора.
 *
 * Всё, что человек когда-либо загрузил, лежит здесь и ставится на дорожку одним нажатием
 * или перетаскиванием. Без этого списка загруженный файл существовал только внутри той
 * сцены, куда его положили: чтобы поставить его второй раз, приходилось загружать заново.
 *
 * Образы Студии — аватары и локации — лежат отдельной вкладкой. Это тот же материал для
 * ролика, но приходит он из другого места и живёт своей жизнью, поэтому в общей куче
 * загруженные кадры и образы мешали друг друга искать.
 */

export type MediaLibraryItem = {
  id: string;
  title: string;
  url: string;
  kind: 'image' | 'video';
  group: 'upload' | 'studio';
};

/** Тип файла по расширению: mime у ассета есть, но для ссылок из библиотеки его нет. */
function itemKind(asset: UserMediaAsset): 'image' | 'video' {
  if (asset.mimeType?.startsWith('video/')) return 'video';
  if (asset.tags?.includes('video')) return 'video';
  return /\.(mp4|webm|mov)(\?|$)/i.test(asset.publicUrl) ? 'video' : 'image';
}

export function MediaLibraryPanel({
  uploading,
  onPickFile,
  onAdd,
}: {
  uploading: boolean;
  onPickFile: () => void;
  /** Ставит материал на дорожку. Длительность видео редактор измеряет сам. */
  onAdd: (item: MediaLibraryItem) => void;
}) {
  const [tab, setTab] = useState<MediaLibraryItem['group']>('upload');
  const [search, setSearch] = useState('');
  const uploads = useListUserMediaAssetsQuery({ kind: 'user-upload', limit: 100 });
  const avatars = useListUserMediaAssetsQuery({ kind: 'user-avatar', limit: 100 });
  const locations = useListUserMediaAssetsQuery({ kind: 'user-location', limit: 100 });

  const items = useMemo<MediaLibraryItem[]>(() => {
    const toItem = (asset: UserMediaAsset, group: MediaLibraryItem['group']): MediaLibraryItem => ({
      id: asset.id,
      title: asset.title,
      url: asset.publicUrl,
      kind: itemKind(asset),
      group,
    });
    return [
      ...(uploads.data?.items ?? []).map((asset) => toItem(asset, 'upload')),
      ...(avatars.data?.items ?? []).map((asset) => toItem(asset, 'studio')),
      ...(locations.data?.items ?? []).map((asset) => toItem(asset, 'studio')),
    ];
  }, [uploads.data, avatars.data, locations.data]);

  const inTab = items.filter((item) => item.group === tab);
  const query = search.trim().toLowerCase();
  const shown = query ? inTab.filter((item) => item.title.toLowerCase().includes(query)) : inTab;
  const loading = tab === 'upload' ? uploads.isLoading : avatars.isLoading || locations.isLoading;
  const counts = {
    upload: items.filter((item) => item.group === 'upload').length,
    studio: items.filter((item) => item.group === 'studio').length,
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
        {([
          { code: 'upload', title: 'В проекте' },
          { code: 'studio', title: 'Студия' },
        ] as const).map((option) => (
          <button
            key={option.code}
            type="button"
            onClick={() => setTab(option.code)}
            className={cn(
              'rounded-md px-2 py-1.5 text-xs font-medium transition',
              tab === option.code ? 'bg-amber-400/15 text-amber-200' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {option.title}
            {counts[option.code] > 0 && <span className="ml-1 text-slate-500">{counts[option.code]}</span>}
          </button>
        ))}
      </div>

      {tab === 'upload' && (
      <button
        type="button"
        onClick={onPickFile}
        disabled={uploading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-700 py-3 text-sm text-slate-300 transition hover:border-amber-400/60 hover:text-amber-200 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {uploading ? 'Загружаем…' : 'Загрузить файл'}
      </button>
      )}

      {inTab.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по названию"
            className="h-8 border-slate-700 bg-slate-950 pl-8 text-xs"
          />
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Открываем медиатеку…
        </p>
      ) : shown.length === 0 ? (
        <p className="py-4 text-xs leading-5 text-slate-500">
          {tab === 'upload'
            ? 'Пока пусто. Загруженные файлы появятся здесь — их можно будет ставить на дорожку сколько угодно раз.'
            : 'В Студии пока нет образов. Аватары и локации оттуда появятся здесь и станут материалом для ролика.'}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {shown.map((item) => (
            <button
              key={`${item.group}-${item.id}`}
              type="button"
              draggable
              onDragStart={(event) => {
                // Тот же формат читает дорожка: перетаскивание и клик кладут одно и то же.
                event.dataTransfer.setData('application/x-allvision-media', JSON.stringify(item));
                event.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => onAdd(item)}
              title={`${item.title} — нажмите или перетащите на дорожку`}
              className={cn(
                'group relative aspect-square overflow-hidden rounded-lg border border-slate-800 bg-slate-900 transition',
                'hover:border-amber-400/60',
              )}
            >
              {item.kind === 'video' ? (
                <video
                  src={`${mediaUrl(item.url)}#t=0.1`}
                  muted
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(item.url) ?? ''} alt="" className="h-full w-full object-cover" />
              )}
              <span className="absolute left-1 top-1 grid h-4 w-4 place-items-center rounded bg-slate-950/80 text-slate-300">
                {item.kind === 'video' ? <Video className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
              </span>
              <span className="absolute inset-x-0 bottom-0 truncate bg-slate-950/85 px-1 py-0.5 text-left text-[10px] text-slate-300">
                {item.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
