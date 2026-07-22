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
  /** Контролируемый режим: модалка открывается снаружи (единая скрепка чата), без своей кнопки. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  /** Подпись слота в заголовке модалки («Последний кадр», «Видео движения»...). */
  slotLabel?: string;
};

type PickerTab = 'upload' | 'studio' | 'site';

function errorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось загрузить файл';
}

// Должно совпадать с серверным MAX_CHAT_INPUT_SIZE (apps/api/src/middleware/upload.ts).
const CHAT_UPLOAD_MAX_MB = 25;

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

export function InputSourcePicker({ mediaKind, value, required, compact, iconOnly, onChange, open: openProp, onOpenChange, hideTrigger, slotLabel }: InputSourcePickerProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
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
    if (file.size > CHAT_UPLOAD_MAX_MB * 1024 * 1024) {
      toast({ title: `Файл больше ${CHAT_UPLOAD_MAX_MB} МБ. Загрузите версию полегче.`, variant: 'destructive' });
      event.target.value = '';
      return;
    }
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
    <div className={cn('space-y-3', (compact || hideTrigger) && 'space-y-0')}>
      <div className={cn('flex flex-wrap items-center gap-3', hideTrigger && 'hidden')}>
        {!hideTrigger && (
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? 'icon' : compact ? 'sm' : 'default'}
          className={cn('border-border', iconOnly ? 'h-8 w-8 bg-background' : compact ? 'h-8 bg-background' : 'bg-card')}
          onClick={() => setOpen(true)}
          title={buttonLabel}
          aria-label={buttonLabel}
        >
          <TriggerIcon className="h-4 w-4" />
          <span className={cn(iconOnly && 'sr-only')}>{buttonLabel}</span>
        </Button>
        )}
        {value && !compact && !hideTrigger && (
          <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-card p-2">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-background">
              {value.mediaKind === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value.url} alt="" className="h-full w-full object-cover" />
              ) : value.mediaKind === 'video' ? (
                <video src={value.url} className="h-full w-full object-cover" muted />
              ) : (
                <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">AUDIO</div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{value.title}</div>
              <div className="text-xs text-muted-foreground">{value.origin === 'studio' ? 'Мои материалы' : value.origin === 'site' ? 'Библиотека Академии' : value.origin === 'result' ? 'Результат чата' : 'Загрузка'}</div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {open && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[200] grid min-h-dvh place-items-center overflow-y-auto bg-black/75 p-4" role="dialog" aria-modal="true">
          <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-hidden border-border bg-card">
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{slotLabel ? `Референс: ${slotLabel}` : 'Выбор референса'}</h3>
                  <p className="text-sm text-muted-foreground">{mediaKind === 'image' ? 'Изображение для модели' : mediaKind === 'video' ? 'Видео для модели' : 'Аудио для модели'}</p>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-border p-4">
                {[
                  { id: 'upload' as const, label: 'Загрузить с компьютера' },
                  { id: 'studio' as const, label: 'Из моих материалов' },
                  { id: 'site' as const, label: 'Из библиотеки Академии' },
                ].map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant={tab === item.id ? 'default' : 'outline'}
                    onClick={() => setTab(item.id)}
                    className={cn(tab === item.id && 'bg-primary hover:bg-primary')}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              <div className="max-h-[calc(100dvh-220px)] overflow-y-auto p-4">
                {tab === 'upload' && (
                  <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-8 text-center transition hover:border-primary">
                    {uploadState.isLoading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
                    <span className="mt-3 font-medium text-foreground">Выберите файл</span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      {mediaKind === 'image' ? 'JPEG, PNG или WebP до 25 МБ' : mediaKind === 'video' ? 'MP4 или MOV до 25 МБ' : 'MP3, WAV или OGG до 25 МБ'}
                    </span>
                    <Input type="file" accept={fileAccept(mediaKind)} className="sr-only" onChange={changeFile} />
                  </label>
                )}

                {tab === 'studio' && (
                  <AssetGrid
                    emptyText={mediaKind === 'image' ? 'В личной медиатеке пока нет аватаров или локаций.' : 'Личная медиатека пока хранит только изображения.'}
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
                    emptyText="В библиотеке Академии нет подходящих файлов."
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
      <div className="grid min-h-56 place-items-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
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
          className="overflow-hidden rounded-md border border-border bg-background text-left transition hover:border-primary"
        >
          <div className="relative aspect-square bg-card">
            {item.mediaKind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            ) : item.mediaKind === 'video' ? (
              <video src={item.fullUrl} className="h-full w-full object-cover" muted />
            ) : (
              <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">AUDIO</div>
            )}
            <Badge className="absolute left-2 top-2 bg-card text-foreground">{item.badge}</Badge>
          </div>
          <div className="flex items-center gap-2 p-3">
            <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="truncate text-sm text-foreground">{item.title}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
