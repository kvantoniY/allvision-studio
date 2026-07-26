'use client';

import { useRef, useState } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import type { AcademyAssetDragData, AcademyLibraryScope } from '@allvision/shared';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useGetAcademyLibraryQuery, useUploadAcademyImageMutation } from '@/store/api/academy-materials-api';

const SCOPE_TABS: { scope: AcademyLibraryScope; label: string }[] = [
  { scope: 'shared', label: 'Общая' },
  { scope: 'teacher', label: 'Моя' },
];

const MAX_UPLOAD = 15 * 1024 * 1024;

export function AssetPickerDialog({
  onPick,
  onClose,
  uploadKind = 'academy-background',
}: {
  onPick: (drag: AcademyAssetDragData) => void;
  onClose: () => void;
  /** Категория библиотеки для загруженной картинки. */
  uploadKind?: string;
}) {
  const [scope, setScope] = useState<AcademyLibraryScope>('shared');
  const { data, isLoading } = useGetAcademyLibraryQuery({ scope });
  const [uploadImage, { isLoading: uploading }] = useUploadAcademyImageMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const items = data?.items ?? [];

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast({ title: 'Только JPG, PNG или WebP', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_UPLOAD) {
      toast({ title: 'Файл больше 15 МБ', variant: 'destructive' });
      return;
    }
    try {
      const res = await uploadImage({ file, kind: uploadKind }).unwrap();
      toast({ title: 'Картинка загружена в библиотеку' });
      onPick(res.asset.dragData);
      onClose();
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось загрузить', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Выбрать материал</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex items-center gap-1.5">
          {SCOPE_TABS.map((t) => (
            <button
              key={t.scope}
              type="button"
              onClick={() => setScope(t.scope)}
              className={cn('rounded-full border px-3 py-1.5 text-sm', scope === t.scope ? 'border-primary bg-accent text-accent-foreground' : 'border-border text-muted-foreground')}
            >
              {t.label}
            </button>
          ))}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onUpload(e.target.files?.[0])} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/50 px-3 py-1.5 text-sm text-primary transition hover:bg-accent disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Загрузить свою
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {[...Array(8)].map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              В этой библиотеке пока нет материалов. Загрузите свою картинку кнопкой «Загрузить свою» или сгенерируйте в разделе «Библиотека».
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {items.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onPick(a.dragData); onClose(); }}
                  className="group overflow-hidden rounded-lg border border-border text-left transition hover:border-primary"
                >
                  <div className="aspect-square bg-muted">
                    {a.mimeType.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumbnailUrl ?? a.fileUrl} alt={a.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">{a.kindLabel}</div>
                    )}
                  </div>
                  <p className="truncate px-1.5 py-1 text-xs">{a.title}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
