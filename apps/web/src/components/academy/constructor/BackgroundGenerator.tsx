'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';
import type { AcademyAssetDragData } from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useGenerateAcademyMaterialMutation,
  useGetAcademyGenerationQuery,
  useGetAcademyLibraryQuery,
} from '@/store/api/academy-materials-api';

/**
 * Генерация фона сцены по промпту: результат сохраняется в библиотеку преподавателя (A5)
 * и привязывается к сцене. Повторно тот же фон не перегенерируется — можно взять из библиотеки.
 */
export function BackgroundGenerator({
  onGenerated,
  onClose,
}: {
  onGenerated: (drag: AcademyAssetDragData) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [generate, { isLoading: starting }] = useGenerateAcademyMaterialMutation();
  const gen = useGetAcademyGenerationQuery(projectId ?? '', { skip: !projectId, pollingInterval: 2000 });
  const library = useGetAcademyLibraryQuery({ scope: 'teacher', kind: 'academy-background' });
  const done = useRef(false);

  const status = gen.data?.generation.status;
  const busy = starting || status === 'PENDING' || status === 'PROCESSING';

  const start = async () => {
    if (prompt.trim().length < 8) { toast({ title: 'Опишите фон подробнее (от 8 символов)', variant: 'destructive' }); return; }
    done.current = false;
    try {
      const res = await generate({
        kind: 'background',
        operation: 'generate',
        title: prompt.trim().slice(0, 60),
        prompt: prompt.trim(),
        model: 'nano-banana',
        style: 'cinematic-animation',
        aspectRatio: '16:9',
        quality: 'medium',
        resolution: '1K',
        count: 1,
        transparentBackground: false,
        characterReferenceIds: [],
        referenceAssetIds: [],
        tags: ['scene-background'],
        maxCostUsd: 1,
      }).unwrap();
      setProjectId(res.generation.projectId);
    } catch (err) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось запустить генерацию', description: msg, variant: 'destructive' });
    }
  };

  // На завершении — найти ассет в библиотеке и привязать к сцене.
  useEffect(() => {
    if (done.current) return;
    if (status === 'FAILED') {
      done.current = true;
      toast({ title: 'Генерация не удалась', description: gen.data?.generation.errorMessage ?? undefined, variant: 'destructive' });
      return;
    }
    if (status !== 'COMPLETED') return;
    const assetId = gen.data?.generation.assetIds[0];
    if (!assetId) return;
    void library.refetch().then((r) => {
      const asset = r.data?.items.find((a) => a.id === assetId);
      if (asset) {
        done.current = true;
        toast({ title: 'Фон сгенерирован и сохранён в библиотеку' });
        onGenerated(asset.dragData);
        onClose();
      }
    });
  }, [status, gen.data, library, onGenerated, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="academy-theme w-full max-w-md rounded-2xl bg-card p-5 text-foreground" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" /> Сгенерировать фон</h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="Например: сказочный замок из чисел на закате, тёплые цвета, кинематографичный свет"
          disabled={busy}
        />
        <p className="mt-1 text-xs text-muted-foreground">Формат 16:9. Результат попадёт в библиотеку преподавателя, чтобы переиспользовать без повторной генерации.</p>
        <Button className="mt-3 w-full" onClick={start} disabled={busy || !prompt.trim()}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {busy ? (status === 'PROCESSING' ? `Генерация… ${gen.data?.generation.progress ?? 0}%` : 'Запуск…') : 'Сгенерировать фон'}
        </Button>
      </div>
    </div>
  );
}
