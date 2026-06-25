'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { toast } from '@/hooks/use-toast';
import {
  type AdminTrend,
  useCreateAdminTrendMutation,
  useDeleteAdminTrendMutation,
  useUpdateAdminTrendMutation,
} from '@/store/api/admin-trends-api';

type AdminTrendFormProps = {
  mode: 'create' | 'edit';
  trend?: AdminTrend;
};

type ApiError = {
  data?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

function apiErrorMessage(error: unknown) {
  const code = (error as ApiError)?.data?.error?.code;
  if (code === 'INVALID_AI_CONFIG') return 'aiConfig не валидный JSON';
  if (code === 'FILE_TOO_LARGE') return 'Файл слишком большой';
  if (code === 'UNSUPPORTED_FORMAT') return 'Неподдерживаемый формат файла';
  if (code === 'TREND_IN_USE') return 'Невозможно удалить: есть активные проекты с этим трендом';
  return (error as ApiError)?.data?.error?.message ?? 'Не удалось сохранить тренд';
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function fileSummary(file: File | null) {
  if (!file) return null;
  return `${file.name} (${Math.round(file.size / 1024)} KB)`;
}

export function AdminTrendForm({ mode, trend }: AdminTrendFormProps) {
  const router = useRouter();
  const [createTrend, createState] = useCreateAdminTrendMutation();
  const [updateTrend, updateState] = useUpdateAdminTrendMutation();
  const [deleteTrend, deleteState] = useDeleteAdminTrendMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [title, setTitle] = useState(trend?.title ?? '');
  const [description, setDescription] = useState(trend?.description ?? '');
  const [prompt, setPrompt] = useState(trend?.prompt ?? '');
  const [aiModel, setAiModel] = useState(trend?.aiModel ?? 'mock-trend-v1');
  const [aiConfig, setAiConfig] = useState(prettyJson(trend?.aiConfig));
  const [priceTokens, setPriceTokens] = useState(trend?.priceTokens?.toString() ?? '');
  const [isActive, setIsActive] = useState(trend?.isActive ?? true);
  const [previewVideo, setPreviewVideo] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);

  const thumbnailPreview = useMemo(() => {
    if (!thumbnail) return null;
    return URL.createObjectURL(thumbnail);
  }, [thumbnail]);

  const isBusy = createState.isLoading || updateState.isLoading;
  const isCreate = mode === 'create';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      JSON.parse(aiConfig || '{}');
    } catch {
      toast({ title: 'aiConfig не валидный JSON', variant: 'destructive' });
      return;
    }

    if (isCreate && (!previewVideo || !thumbnail)) {
      toast({ title: 'Добавьте preview video и thumbnail', variant: 'destructive' });
      return;
    }

    const form = new FormData();
    form.append('title', title);
    form.append('description', description);
    form.append('prompt', prompt);
    form.append('serviceSlug', 'trends');
    form.append('aiModel', aiModel);
    form.append('aiConfig', aiConfig || '{}');
    form.append('priceTokens', priceTokens.trim());
    form.append('isActive', String(isActive));
    if (previewVideo) form.append('previewVideo', previewVideo);
    if (thumbnail) form.append('thumbnail', thumbnail);

    try {
      if (isCreate) {
        await createTrend(form).unwrap();
      } else if (trend) {
        await updateTrend({ id: trend.id, body: form }).unwrap();
      }
      router.push('/admin/trends');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!trend) return;
    try {
      await deleteTrend(trend.id).unwrap();
      setDeleteOpen(false);
      router.push('/admin/trends');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Название</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">Промпт</Label>
              <Textarea
                id="prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                maxLength={2000}
                className="font-mono"
                required
              />
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="aiModel">AI-модель</Label>
                <Input id="aiModel" value={aiModel} onChange={(e) => setAiModel(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceTokens">Цена, токены</Label>
                <Input
                  id="priceTokens"
                  type="number"
                  min={1}
                  value={priceTokens}
                  onChange={(e) => setPriceTokens(e.target.value)}
                  placeholder="По умолчанию используется цена услуги (150)"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aiConfig">AI-конфиг</Label>
              <Textarea
                id="aiConfig"
                value={aiConfig}
                onChange={(e) => setAiConfig(e.target.value)}
                rows={6}
                className="font-mono"
              />
            </div>
            <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              Тренд активен
            </label>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="previewVideo">Превью-видео</Label>
              <Input
                id="previewVideo"
                type="file"
                accept="video/*"
                required={isCreate}
                onChange={(e) => setPreviewVideo(e.target.files?.[0] ?? null)}
              />
              {fileSummary(previewVideo) && <p className="text-xs text-slate-400">{fileSummary(previewVideo)}</p>}
              {!isCreate && trend?.previewVideo && (
                <Link href={trend.previewVideo} target="_blank" className="block text-sm text-violet-300 hover:text-violet-200">
                  Текущее видео
                </Link>
              )}
              {!isCreate && <p className="text-xs text-slate-500">Загрузите новый файл, чтобы заменить</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="thumbnail">Обложка</Label>
              <Input
                id="thumbnail"
                type="file"
                accept="image/*"
                required={isCreate}
                onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
              />
              {thumbnailPreview && (
                <img src={thumbnailPreview} alt="" className="h-36 w-full rounded-md object-cover" />
              )}
              {!thumbnailPreview && trend?.referenceImg && (
                <img src={trend.referenceImg} alt="" className="h-36 w-full rounded-md object-cover" />
              )}
              {!isCreate && <p className="text-xs text-slate-500">Загрузите новый файл, чтобы заменить</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-5">
          <div>
            {!isCreate && trend && (
              <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button asChild type="button" variant="outline">
              <Link href="/admin/trends">Отмена</Link>
            </Button>
            <Button type="submit" disabled={isBusy} className="bg-violet-600 hover:bg-violet-500">
              {isCreate ? 'Создать тренд' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить тренд?"
        description="Тренд будет удалён без восстановления. Если есть активные проекты, сервер не даст его удалить."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
