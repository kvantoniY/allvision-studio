'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, Library, Loader2, Paperclip, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetPublicMediaAssetsQuery } from '@/store/api/public-api';
import { type UserMediaAsset, useListUserMediaAssetsQuery } from '@/store/api/user-media-assets-api';
import { useUploadChatInputMutation } from '@/store/api/user-chat-api';

export type SelectedInputSource = {
  ref: string;
  url: string;
  title: string;
  mediaKind: 'image' | 'video' | 'audio';
  origin: 'upload' | 'studio' | 'site' | 'result';
};

type InputSourcePickerProps = {
  mediaKind: 'image' | 'video' | 'audio';
  value: SelectedInputSource | null;
  required?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
  onChange: (value: SelectedInputSource | null) => void;
};

type PickerTab = 'upload' | 'studio' | 'site';

function errorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось загрузить файл';
}

function fileAccept(mediaKind: 'image' | 'video' | 'audio') {
  if (mediaKind === 'image') return 'image/jpeg,image/png,image/webp';
  if (mediaKind === 'video') return 'video/mp4,video/quicktime';
  return 'audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/ogg';
}

function isImageAsset(asset: { mimeType?: string | null }) {
  return !asset.mimeType || asset.mimeType.startsWith('image/');
}

function flattenStudioAssetChoices(items: UserMediaAsset[]): UserMediaAsset[] {
  return items.flatMap((asset) => {
    const choices: UserMediaAsset[] = isImageAsset(asset) ? [asset] : [];
    for (const [index, variation] of (asset.variations ?? []).entries()) {
      if (!isImageAsset(variation)) continue;
      choices.push({
        ...variation,
        title: `${asset.title} · Вариация ${index + 1}`,
        kind: asset.kind,
      });
    }
    return choices;
  });
}

export function InputSourcePicker({ mediaKind, value, required, compact, iconOnly, onChange }: InputSourcePickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>('upload');
  const [upload, uploadState] = useUploadChatInputMutation();
  const avatars = useListUserMediaAssetsQuery({ kind: 'user-avatar', limit: 100 }, { skip: mediaKind !== 'image' });
  const locations = useListUserMediaAssetsQuery({ kind: 'user-location', limit: 100 }, { skip: mediaKind !== 'image' });
  const publicAssets = useGetPublicMediaAssetsQuery({
    kind: mediaKind === 'image' ? 'preview-image' : mediaKind === 'video' ? 'trend-video' : 'music-track',
    active: true,
  });

  const studioItems = useMemo(
    () => flattenStudioAssetChoices([...(avatars.data?.items ?? []), ...(locations.data?.items ?? [])]),
    [avatars.data?.items, locations.data?.items],
  );

  const changeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const result = await upload(form).unwrap();
      onChange({
        ref: result.input.ref,
        url: result.input.url,
        title: file.name,
        mediaKind: result.input.mediaKind,
        origin: 'upload',
      });
      toast({ title: 'Файл прикреплен' });
      setOpen(false);
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  const buttonLabel = compact
    ? (value ? 'Референс' : required ? 'Нужен реф.' : 'Прикрепить')
    : value ? 'Заменить референс' : required ? 'Выбрать референс' : 'Прикрепить';
  const TriggerIcon = compact || iconOnly ? Paperclip : Library;

  return (
    <div className={cn('space-y-3', compact && 'space-y-0')}>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? 'icon' : compact ? 'sm' : 'default'}
          className={cn('border-slate-700', iconOnly ? 'h-8 w-8 bg-slate-950' : compact ? 'h-8 bg-slate-950' : 'bg-slate-900')}
          onClick={() => setOpen(true)}
          title={buttonLabel}
          aria-label={buttonLabel}
        >
          <TriggerIcon className="h-4 w-4" />
          <span className={cn(iconOnly && 'sr-only')}>{buttonLabel}</span>
        </Button>
        {value && !compact && (
          <div className="flex min-w-0 items-center gap-3 rounded-md border border-slate-800 bg-slate-900 p-2">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-slate-950">
              {value.mediaKind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value.url} alt="" className="h-full w-full object-cover" />
              ) : value.mediaKind === 'video' ? (
                <video src={value.url} className="h-full w-full object-cover" muted />
              ) : (
                <div className="grid h-full w-full place-items-center text-[10px] text-slate-400">AUDIO</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-slate-100">{value.title}</div>
              <div className="text-xs text-slate-500">{value.origin === 'studio' ? 'Студия' : value.origin === 'site' ? 'Библиотека сайта' : value.origin === 'result' ? 'Результат чата' : 'Загрузка'}</div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {open && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[200] grid min-h-dvh place-items-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true">
          <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-hidden border-slate-800 bg-slate-900">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-slate-800 p-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">Выбор референса</h3>
                  <p className="text-sm text-slate-500">{mediaKind === 'image' ? 'Изображение для модели' : mediaKind === 'video' ? 'Видео для модели' : 'Audio reference'}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-slate-800 p-4">
                {[
                  { id: 'upload' as const, label: 'Загрузить с компьютера' },
                  { id: 'studio' as const, label: 'Из моей Студии' },
                  { id: 'site' as const, label: 'Из библиотеки сайта' },
                ].map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={tab === item.id ? 'default' : 'outline'}
                    onClick={() => setTab(item.id)}
                    className={cn(tab === item.id && 'bg-violet-600 hover:bg-violet-500')}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              <div className="max-h-[calc(100dvh-220px)] overflow-y-auto p-4">
                {tab === 'upload' && (
                  <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950 p-8 text-center transition hover:border-violet-500">
                    {uploadState.isLoading ? <Loader2 className="h-8 w-8 animate-spin text-violet-300" /> : <Upload className="h-8 w-8 text-violet-300" />}
                    <span className="mt-3 font-medium text-slate-100">Выберите файл</span>
                    <span className="mt-1 text-sm text-slate-500">
                      {mediaKind === 'image' ? 'JPEG, PNG или WebP до 25 МБ' : mediaKind === 'video' ? 'MP4 или MOV до 25 МБ' : 'MP3, WAV или OGG до 25 МБ'}
                    </span>
                    <Input type="file" accept={fileAccept(mediaKind)} className="sr-only" onChange={changeFile} />
                  </label>
                )}

                {tab === 'studio' && (
                  <AssetGrid
                    emptyText={mediaKind === 'image' ? 'В Студии пока нет аватаров или локаций.' : 'Личная Студия пока хранит только изображения.'}
                    items={studioItems.map((asset) => ({
                      id: asset.id,
                      ref: `asset:${asset.id}`,
                      url: asset.thumbnailUrl || asset.publicUrl,
                      fullUrl: asset.publicUrl,
                      title: asset.title,
                      badge: asset.kind === 'user-avatar' ? 'Аватар' : 'Локация',
                      mediaKind: 'image' as const,
                    }))}
                    onSelect={(item) => {
                      onChange({ ref: item.ref, url: item.fullUrl, title: item.title, mediaKind: item.mediaKind, origin: 'studio' });
                      setOpen(false);
                    }}
                  />
                )}

                {tab === 'site' && (
                  <AssetGrid
                    emptyText="В библиотеке сайта нет подходящих файлов."
                    items={(publicAssets.data?.assets ?? []).map((asset) => ({
                      id: asset.id,
                      ref: `asset:${asset.id}`,
                      url: asset.thumbnailUrl || asset.publicUrl,
                      fullUrl: asset.publicUrl,
                      title: asset.title,
                      badge: asset.kind,
                      mediaKind,
                    }))}
                    onSelect={(item) => {
                      onChange({ ref: item.ref, url: item.fullUrl, title: item.title, mediaKind: item.mediaKind, origin: 'site' });
                      setOpen(false);
                    }}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ), document.body)}
    </div>
  );
}

type AssetGridItem = {
  id: string;
  ref: string;
  url: string;
  fullUrl: string;
  title: string;
  badge: string;
  mediaKind: 'image' | 'video' | 'audio';
};

function AssetGrid({
  items,
  emptyText,
  onSelect,
}: {
  items: AssetGridItem[];
  emptyText: string;
  onSelect: (item: AssetGridItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-slate-800 text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item)}
          className="overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-left transition hover:border-violet-500"
        >
          <div className="relative aspect-square bg-slate-900">
            {item.mediaKind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            ) : item.mediaKind === 'video' ? (
              <video src={item.fullUrl} className="h-full w-full object-cover" muted />
            ) : (
              <div className="grid h-full w-full place-items-center text-xs text-slate-400">AUDIO</div>
            )}
            <Badge className="absolute left-2 top-2 bg-slate-950/80 text-slate-100">{item.badge}</Badge>
          </div>
          <div className="flex items-center gap-2 p-3">
            <ImageIcon className="h-4 w-4 shrink-0 text-slate-500" />
            <div className="truncate text-sm text-slate-100">{item.title}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
