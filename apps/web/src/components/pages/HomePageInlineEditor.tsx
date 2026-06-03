'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState, type ReactNode } from 'react';
import { Check, ImagePlus, Link as LinkIcon, Loader2, Pencil, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { HomeMedia } from '@/lib/home-landing-content';
import type { PublicService } from '@allvision/shared';
import {
  useCreateAdminMediaAssetMutation,
  useListAdminMediaAssetsQuery,
  type AdminMediaAsset,
} from '@/store/api/admin-media-assets-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export type HomeEditorPath = Array<string | number>;

export type HomeTextEditState = {
  path: HomeEditorPath;
  label: string;
  value: string;
  multiline?: boolean;
};

export type HomeMediaEditState = {
  path: HomeEditorPath;
  label: string;
  media: HomeMedia;
};

export type HomeServiceSlotEditState = {
  path: HomeEditorPath;
  label: string;
  value: string;
};

export type HomeEditorController = {
  enabled: boolean;
  saving: boolean;
  openTextEditor: (edit: HomeTextEditState) => void;
  openMediaEditor: (edit: HomeMediaEditState) => void;
  openServiceSlotEditor: (edit: HomeServiceSlotEditState) => void;
  setValue: (path: HomeEditorPath, value: unknown) => void;
};

export function HomeAdminToolbar({
  enabled,
  saving,
  onToggle,
}: {
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="fixed right-4 top-16 z-[70] md:right-6 md:top-4">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold shadow-2xl shadow-black/30 transition',
          enabled
            ? 'border-emerald-300/50 bg-emerald-500 text-slate-950 hover:bg-emerald-400'
            : 'border-violet-300/40 bg-slate-900 text-white hover:bg-slate-800',
        )}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
        {enabled ? 'Редактирование включено' : 'Редактировать главную'}
      </button>
    </div>
  );
}

export function EditableText({
  editor,
  path,
  label,
  value,
  multiline,
  children,
  className,
}: {
  editor?: HomeEditorController;
  path: HomeEditorPath;
  label: string;
  value: string;
  multiline?: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (!editor?.enabled) return <>{children}</>;

  return (
    <span className={cn('group/home-edit relative inline-block max-w-full rounded-sm outline outline-1 outline-dashed outline-amber-300/25', className)}>
      {children}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          editor.openTextEditor({ path, label, value, multiline });
        }}
        className="absolute -right-2 -top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300/50 bg-slate-950 text-amber-200 opacity-0 shadow-lg shadow-black/30 transition hover:bg-amber-400 hover:text-slate-950 group-hover/home-edit:opacity-100"
        aria-label={`Редактировать: ${label}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function EditableMedia({
  editor,
  path,
  label,
  media,
  children,
  className,
}: {
  editor?: HomeEditorController;
  path: HomeEditorPath;
  label: string;
  media: HomeMedia;
  children: ReactNode;
  className?: string;
}) {
  if (!editor?.enabled) return <>{children}</>;

  return (
    <div className={cn('group/home-media relative h-full w-full outline outline-1 outline-dashed outline-amber-300/30', className)}>
      {children}
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          editor.openMediaEditor({ path, label, media });
        }}
        className="absolute right-3 top-3 z-30 inline-flex items-center gap-2 rounded-full border border-amber-300/50 bg-slate-950/90 px-3 py-1.5 text-xs font-semibold text-amber-100 opacity-0 shadow-lg shadow-black/30 backdrop-blur transition hover:bg-amber-400 hover:text-slate-950 group-hover/home-media:opacity-100"
      >
        <ImagePlus className="h-3.5 w-3.5" />
        Медиа
      </button>
    </div>
  );
}

export function HomeTextEditorModal({
  edit,
  saving,
  onClose,
  onSave,
}: {
  edit: HomeTextEditState | null;
  saving: boolean;
  onClose: () => void;
  onSave: (path: HomeEditorPath, value: string) => void;
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(edit?.value ?? '');
  }, [edit]);

  if (!edit) return null;

  return (
    <EditorOverlay title={edit.label} onClose={onClose}>
      {edit.multiline ? (
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="min-h-40 border-slate-700 bg-slate-950 text-slate-100"
          autoFocus
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="border-slate-700 bg-slate-950 text-slate-100"
          autoFocus
        />
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" className="border-slate-700 bg-slate-950" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          disabled={saving}
          onClick={() => onSave(edit.path, value)}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Сохранить
        </Button>
      </div>
    </EditorOverlay>
  );
}

export function HomeMediaEditorModal({
  edit,
  saving,
  onClose,
  onSave,
}: {
  edit: HomeMediaEditState | null;
  saving: boolean;
  onClose: () => void;
  onSave: (path: HomeEditorPath, media: HomeMedia) => void;
}) {
  const [draft, setDraft] = useState<HomeMedia>({ type: 'image', url: '', alt: '' });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [createAsset, uploadState] = useCreateAdminMediaAssetMutation();
  const assets = useListAdminMediaAssetsQuery(
    { page: 1, limit: 36, isActive: true },
    { skip: !edit },
  );

  useEffect(() => {
    if (!edit) return;
    setDraft(edit.media);
    setUploadTitle(edit.label);
    setUploadFile(null);
  }, [edit]);

  if (!edit) return null;

  async function uploadSelectedFile() {
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append(
      'data',
      JSON.stringify({
        kind: 'home-page-media',
        title: uploadTitle.trim() || uploadFile.name,
        tags: ['home-page'],
        isActive: true,
      }),
    );
    const result = await createAsset(formData).unwrap();
    setDraft(mediaFromAsset(result.asset));
  }

  return (
    <EditorOverlay title={edit.label} onClose={onClose} wide>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.78fr)_minmax(280px,0.42fr)]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            <div className="aspect-video">
              <MediaPreview media={draft} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <label className="text-sm font-medium text-slate-300">
              Тип
              <select
                value={draft.type}
                onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as HomeMedia['type'] }))}
                className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100"
              >
                <option value="image">Картинка</option>
                <option value="video">Видео</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-300">
              URL
              <Input
                value={draft.url}
                onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))}
                className="mt-1 border-slate-700 bg-slate-950 text-slate-100"
                placeholder="https://... или /static/..."
              />
            </label>
            <label className="sm:col-span-2 text-sm font-medium text-slate-300">
              Alt / описание
              <Input
                value={draft.alt}
                onChange={(event) => setDraft((current) => ({ ...current, alt: event.target.value }))}
                className="mt-1 border-slate-700 bg-slate-950 text-slate-100"
              />
            </label>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Upload className="h-4 w-4 text-amber-300" />
              Загрузить новое медиа
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                type="file"
                accept="image/*,video/*"
                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                className="border-slate-700 bg-slate-900 text-slate-100"
              />
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 bg-slate-900"
                disabled={!uploadFile || uploadState.isLoading}
                onClick={() => void uploadSelectedFile()}
              >
                {uploadState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Загрузить
              </Button>
            </div>
            <Input
              value={uploadTitle}
              onChange={(event) => setUploadTitle(event.target.value)}
              className="mt-3 border-slate-700 bg-slate-900 text-slate-100"
              placeholder="Название медиа"
            />
          </div>
        </div>

        <div className="min-h-0 rounded-lg border border-slate-800 bg-slate-950 p-3">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <LinkIcon className="h-4 w-4 text-cyan-300" />
            Медиа-библиотека
          </div>
          {assets.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Загружаю медиа
            </div>
          ) : (
            <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-1">
              {(assets.data?.items ?? []).map((asset) => (
                <button
                  type="button"
                  key={asset.id}
                  onClick={() => setDraft(mediaFromAsset(asset))}
                  className="group grid grid-cols-[72px_1fr] gap-3 rounded-md border border-slate-800 bg-slate-900 p-2 text-left transition hover:border-amber-300/60"
                >
                  <div className="overflow-hidden rounded bg-slate-950">
                    <MediaPreview media={mediaFromAsset(asset)} />
                  </div>
                  <div className="min-w-0 self-center">
                    <div className="truncate text-sm font-semibold text-white">{asset.title}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{asset.kind}</div>
                  </div>
                </button>
              ))}
              {!assets.data?.items?.length && (
                <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                  В библиотеке пока нет медиа для выбора.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" className="border-slate-700 bg-slate-950" onClick={onClose}>
          Отмена
        </Button>
        <Button
          type="button"
          className="bg-amber-500 text-slate-950 hover:bg-amber-400"
          disabled={saving || !draft.url.trim()}
          onClick={() => onSave(edit.path, { ...draft, url: draft.url.trim(), alt: draft.alt.trim() || edit.label })}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Сохранить
        </Button>
      </div>
    </EditorOverlay>
  );
}

export function HomeServiceSlotEditorModal({
  edit,
  services,
  saving,
  onClose,
  onSave,
}: {
  edit: HomeServiceSlotEditState | null;
  services: PublicService[];
  saving: boolean;
  onClose: () => void;
  onSave: (path: HomeEditorPath, serviceSlug: string) => void;
}) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (edit) setSearch('');
  }, [edit]);

  if (!edit) return null;

  const visible = services.filter((service) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return service.title.toLowerCase().includes(q) || service.slug.toLowerCase().includes(q);
  });

  return (
    <EditorOverlay title={edit.label} onClose={onClose} wide>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-4 border-slate-700 bg-slate-950 text-slate-100"
        placeholder="Поиск услуги"
        autoFocus
      />
      <div className="grid max-h-[58vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((service) => {
          const media = serviceMediaFromPublicService(service);
          const selected = service.slug === edit.value;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onSave(edit.path, service.slug)}
              disabled={saving}
              className={cn(
                'overflow-hidden rounded-lg border bg-slate-950 text-left transition hover:border-amber-300',
                selected ? 'border-amber-300 ring-1 ring-amber-300/40' : 'border-slate-800',
              )}
            >
              <div className="aspect-[16/10] bg-slate-900">
                {media?.type === 'video' ? (
                  <video src={media.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : media?.type === 'image' ? (
                  <img src={media.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-xs text-slate-500">Нет превью</div>
                )}
              </div>
              <div className="p-3">
                <div className="line-clamp-1 text-sm font-semibold text-white">{service.title}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{service.slug}</div>
              </div>
            </button>
          );
        })}
        {visible.length === 0 && (
          <div className="rounded-md border border-dashed border-slate-700 p-4 text-sm text-slate-400">
            Услуги не найдены.
          </div>
        )}
      </div>
    </EditorOverlay>
  );
}

function EditorOverlay({
  title,
  wide,
  children,
  onClose,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className={cn('max-h-[90vh] w-full overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl shadow-black/40', wide ? 'max-w-5xl' : 'max-w-xl')}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">Главная страница</div>
            <h3 className="mt-1 text-lg font-bold text-white">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-300 hover:text-white"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MediaPreview({ media }: { media: HomeMedia }) {
  if (!media.url) {
    return <div className="flex h-full min-h-24 items-center justify-center bg-slate-950 text-xs text-slate-500">Нет медиа</div>;
  }
  const src = media.url.startsWith('/static/') ? `${API_URL}${media.url}` : media.url;
  if (media.type === 'video') {
    return <video src={src} className="h-full w-full object-cover" muted loop playsInline autoPlay />;
  }
  return <img src={src} alt={media.alt} className="h-full w-full object-cover" />;
}

function mediaFromAsset(asset: AdminMediaAsset): HomeMedia {
  return {
    type: asset.mimeType.startsWith('video/') ? 'video' : 'image',
    url: asset.publicUrl,
    alt: asset.title,
  };
}

function serviceMediaFromPublicService(service: PublicService): HomeMedia | null {
  const image = service.previewImage ?? service.coverImage ?? service.galleryImages[0];
  const video = service.previewVideo;
  if (service.previewMode === 'image' && image) return { type: 'image', url: image, alt: service.title };
  if (service.previewMode === 'video' && video) return { type: 'video', url: video, alt: service.title };
  if (video) return { type: 'video', url: video, alt: service.title };
  if (image) return { type: 'image', url: image, alt: service.title };
  return null;
}
