'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

type MultiImageUploaderProps = {
  value: SelectedImage[];
  onChange: (value: SelectedImage[]) => void;
  maxFiles: number;
  primaryId?: string | null;
  onPrimaryChange?: (id: string) => void;
  disabled?: boolean;
  className?: string;
};

const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function makeImage(file: File): SelectedImage {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

export function MultiImageUploader({
  value,
  onChange,
  maxFiles,
  primaryId,
  onPrimaryChange,
  disabled,
  className,
}: MultiImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  const [isDragging, setIsDragging] = useState(false);
  const primary = primaryId ?? value[0]?.id ?? null;

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      valueRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, []);

  const remaining = Math.max(0, maxFiles - value.length);

  const summary = useMemo(() => {
    if (value.length === 0) return `JPEG, PNG или WebP. До ${maxFiles} файлов.`;
    return `${value.length} из ${maxFiles} файлов выбрано`;
  }, [maxFiles, value.length]);

  const addFiles = (files: FileList | File[]) => {
    if (disabled || remaining <= 0) return;
    const nextFiles = Array.from(files)
      .filter((file) => acceptedTypes.has(file.type))
      .slice(0, remaining)
      .map(makeImage);

    if (nextFiles.length === 0) return;
    const next = [...value, ...nextFiles];
    onChange(next);
    if (!primary && next[0]) onPrimaryChange?.(next[0].id);
  };

  const remove = (id: string) => {
    const image = value.find((item) => item.id === id);
    if (image) URL.revokeObjectURL(image.previewUrl);
    const next = value.filter((item) => item.id !== id);
    onChange(next);
    if (primary === id && next[0]) onPrimaryChange?.(next[0].id);
  };

  return (
    <div className={cn('space-y-3', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(event.dataTransfer.files);
        }}
        className={cn(
          'flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-700 bg-slate-900/70 px-4 py-6 text-center transition',
          isDragging && 'border-violet-400 bg-violet-500/10',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <ImagePlus className="h-8 w-8 text-violet-300" />
        <div>
          <div className="text-sm font-medium text-slate-100">Перетащите изображения сюда или нажмите</div>
          <div className="mt-1 text-xs text-slate-400">{summary}</div>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) addFiles(event.target.files);
          event.currentTarget.value = '';
        }}
      />

      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {value.map((image) => {
            const isPrimary = image.id === primary;
            return (
              <div key={image.id} className="relative aspect-square overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-x-1 top-1 flex items-center justify-between gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant={isPrimary ? 'default' : 'outline'}
                    className="h-8 w-8"
                    onClick={() => onPrimaryChange?.(image.id)}
                    aria-label="Сделать главным"
                  >
                    <Star className={cn('h-4 w-4', isPrimary && 'fill-current')} />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    onClick={() => remove(image.id)}
                    aria-label="Удалить изображение"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {isPrimary && (
                  <div className="absolute bottom-1 left-1 rounded bg-violet-600 px-2 py-1 text-[11px] font-medium text-white">
                    Главное
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
