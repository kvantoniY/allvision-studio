'use client';

import { useRef, useState } from 'react';
import { GripVertical, ImagePlus, Loader2, Plus, Shuffle, Trash2, X } from 'lucide-react';
import {
  MINI_GAME_DEFAULT_SETS,
  MINI_GAME_KINDS,
  MINI_GAME_KIND_DESCRIPTIONS,
  MINI_GAME_KIND_LABELS,
  type MiniGameConfig,
  type MiniGameItem,
  type MiniGameKind,
} from '@allvision/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUploadAcademyImageMutation } from '@/store/api/academy-materials-api';
import { AssetPickerDialog } from './AssetPickerDialog';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

function assetUrl(src: string): string {
  return API_URL && src.startsWith('/api/') ? `${API_URL.replace(/\/+$/, '')}${src}` : src;
}

function newItemId(): string {
  return `item-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Редактор мини-игры. Задача: методист собирает игру за минуту, ничего не зная про
 * внутренний формат — выбирает тип, набор карточек (готовый или свой) и число пар.
 */
export function MiniGameEditor({ config, onChange }: { config: MiniGameConfig; onChange: (next: MiniGameConfig) => void }) {
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [uploadImage] = useUploadAcademyImageMutation();
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (next: Partial<MiniGameConfig>) => onChange({ ...config, ...next });
  const setItems = (items: MiniGameItem[]) => patch({ items });

  const updateItem = (id: string, next: Partial<MiniGameItem>) => {
    setItems(config.items.map((item) => (item.id === id ? { ...item, ...next } : item)));
  };

  const addItem = () => setItems([...config.items, { id: newItemId(), label: '', emoji: '' }]);
  const removeItem = (id: string) => setItems(config.items.filter((item) => item.id !== id));

  const applyPreset = (key: string) => {
    const preset = MINI_GAME_DEFAULT_SETS[key];
    if (!preset) return;
    patch({ items: preset.items.map((item) => ({ ...item })), count: Math.min(config.count, preset.items.length) });
    toast({ title: `Набор «${preset.title}» подставлен` });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const itemId = uploadFor;
    setUploadFor(null);
    if (!file || !itemId) return;
    try {
      const result = await uploadImage({ file, kind: 'academy-prop', title: file.name.replace(/\.[^.]+$/, '') }).unwrap();
      updateItem(itemId, { imageUrl: result.asset.fileUrl });
      toast({ title: 'Картинка загружена в библиотеку' });
    } catch {
      toast({ title: 'Не удалось загрузить картинку', variant: 'destructive' });
    }
  };

  // Сколько карточек реально пойдёт в игру — иначе непонятно, почему заведено 6, а видно 4.
  const usable = config.items.filter((item) => item.imageUrl || item.label || item.emoji);
  const inPlay = Math.min(config.count, Math.max(usable.length, 0));

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-accent/30 p-2.5">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium">Тип игры</Label>
        <div className="grid gap-1.5">
          {MINI_GAME_KINDS.map((kind: MiniGameKind) => (
            <button
              key={kind}
              type="button"
              onClick={() => patch({ kind })}
              className={cn(
                'rounded-md border px-2.5 py-1.5 text-left transition',
                config.kind === kind ? 'border-primary bg-card shadow-sm' : 'border-border bg-background/60 hover:border-primary/40',
              )}
            >
              <span className={cn('block text-xs font-medium', config.kind === kind && 'text-primary')}>{MINI_GAME_KIND_LABELS[kind]}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{MINI_GAME_KIND_DESCRIPTIONS[kind]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Задание ребёнку</Label>
        <Input
          value={config.instruction ?? ''}
          onChange={(e) => patch({ instruction: e.target.value })}
          placeholder={config.kind === 'memory' ? 'Найди все пары' : config.kind === 'match' ? 'Соедини картинку с подписью' : 'Выбери правильный вариант'}
          className="h-8"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            {config.kind === 'memory' ? 'Пар в игре' : config.kind === 'match' ? 'Строк' : 'Вариантов'}
          </span>
          <select
            value={config.count}
            onChange={(e) => patch({ count: Number(e.target.value) })}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
          >
            {[2, 3, 4, 5, 6, 8].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Раскладка</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => patch({ seed: Math.floor(Math.random() * 100000) + 1 })}
            title="Перемешать карточки заново"
          >
            <Shuffle className="mr-1 h-3.5 w-3.5" /> Перемешать
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-[11px]">
        <input type="checkbox" checked={config.showMistakes !== false} onChange={(e) => patch({ showMistakes: e.target.checked })} />
        показывать счётчик ошибок
      </label>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Карточки</Label>
          <span className="text-[10px] text-muted-foreground">в игре: {inPlay}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {Object.entries(MINI_GAME_DEFAULT_SETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyPreset(key)}
              className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-primary/50 hover:text-primary"
            >
              {preset.title}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          {config.items.map((item) => (
            <div key={item.id} className="flex items-start gap-1.5 rounded-md border border-border bg-background p-1.5">
              <GripVertical className="mt-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted text-lg">
                {item.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={assetUrl(item.imageUrl)} alt="" className="h-full w-full object-contain" />
                  : <span>{item.emoji || '—'}</span>}
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  value={item.label ?? ''}
                  onChange={(e) => updateItem(item.id, { label: e.target.value })}
                  placeholder="Подпись"
                  className="h-7 text-xs"
                />
                {config.kind === 'match' ? (
                  <Input
                    value={item.pairLabel ?? ''}
                    onChange={(e) => updateItem(item.id, { pairLabel: e.target.value })}
                    placeholder="Пара к карточке (напр. перевод)"
                    className="h-7 text-xs"
                  />
                ) : (
                  <Input
                    value={item.emoji ?? ''}
                    onChange={(e) => updateItem(item.id, { emoji: e.target.value })}
                    placeholder="Эмодзи (если нет картинки)"
                    className="h-7 text-xs"
                  />
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-6 px-1.5 text-[10px]" onClick={() => setPickerFor(item.id)}>
                    Из библиотеки
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-1.5 text-[10px]"
                    onClick={() => { setUploadFor(item.id); fileRef.current?.click(); }}
                  >
                    <ImagePlus className="mr-0.5 h-3 w-3" /> Загрузить
                  </Button>
                  {item.imageUrl && (
                    <button type="button" className="text-[10px] text-muted-foreground hover:text-destructive" onClick={() => updateItem(item.id, { imageUrl: undefined })}>
                      убрать фото
                    </button>
                  )}
                  {config.kind === 'quiz' && (
                    <label className="ml-auto flex items-center gap-1 text-[10px]">
                      <input type="checkbox" checked={item.correct === true} onChange={(e) => updateItem(item.id, { correct: e.target.checked })} />
                      верный
                    </label>
                  )}
                </div>
              </div>
              <button type="button" aria-label="Удалить карточку" className="mt-1 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" className="h-7 w-full text-xs" onClick={addItem}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Добавить карточку
        </Button>
        {config.kind === 'quiz' && !config.items.some((item) => item.correct) && (
          <p className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900">Отметьте хотя бы один верный вариант.</p>
        )}
        {usable.length < 2 && (
          <p className="rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
            Пока карточек меньше двух — в уроке подставится набор «{MINI_GAME_DEFAULT_SETS.fruits.title}».
          </p>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onFile} />
      {pickerFor && (
        <AssetPickerDialog
          uploadKind="academy-prop"
          onClose={() => setPickerFor(null)}
          onPick={(drag) => {
            updateItem(pickerFor, { imageUrl: drag.fileUrl });
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Источник видео-элемента: файл из библиотеки, загрузка своего или генерация
 * кат-сцены с учеником при подготовке урока.
 */
export function VideoSourceEditor({
  element,
  onPickAsset,
  onContentChange,
  onAttachAsset,
}: {
  element: { asset?: { fileUrl: string; kind: string } | undefined; content: { generation?: { prompt: string; source: 'image' | 'text'; durationSec: number } | undefined; autoplay?: boolean; loop?: boolean } };
  onPickAsset: () => void;
  onContentChange: (patch: Record<string, unknown>) => void;
  onAttachAsset: (drag: { assetId: string; scope: 'shared' | 'teacher' | 'child'; kind: string; fileUrl: string; mimeType: string }) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadImage] = useUploadAcademyImageMutation();
  const fileRef = useRef<HTMLInputElement>(null);
  const generation = element.content.generation;
  const mode: 'asset' | 'generate' = generation ? 'generate' : 'asset';

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const result = await uploadImage({ file, kind: 'academy-background', title: file.name.replace(/\.[^.]+$/, '') }).unwrap();
      onContentChange({ generation: undefined });
      onAttachAsset(result.asset.dragData);
      toast({ title: 'Видео загружено и прикреплено' });
    } catch (error) {
      const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось загрузить видео', description: message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <Label className="text-xs font-medium">Что показать в этом видео</Label>
      <div className="grid gap-1.5">
        <button
          type="button"
          onClick={() => onContentChange({ generation: undefined })}
          className={cn(
            'rounded-md border px-2.5 py-1.5 text-left transition',
            mode === 'asset' ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/40',
          )}
        >
          <span className="block text-xs font-medium">Готовый ролик</span>
          <span className="text-[11px] text-muted-foreground">Файл из библиотеки или загруженный с компьютера — один и тот же для всех учеников.</span>
        </button>
        <button
          type="button"
          onClick={() => onContentChange({
            generation: generation ?? { prompt: '', source: 'image', durationSec: 5 },
          })}
          className={cn(
            'rounded-md border px-2.5 py-1.5 text-left transition',
            mode === 'generate' ? 'border-primary bg-accent/50' : 'border-border hover:border-primary/40',
          )}
        >
          <span className="block text-xs font-medium">Кат-сцена с учеником</span>
          <span className="text-[11px] text-muted-foreground">Ролик создаётся при подготовке урока по внешности конкретного ребёнка.</span>
        </button>
      </div>

      {mode === 'asset' ? (
        <div className="space-y-1.5">
          <Button variant="outline" size="sm" className="w-full" onClick={onPickAsset}>
            {element.asset ? 'Заменить ролик' : 'Выбрать из библиотеки'}
          </Button>
          <Button variant="outline" size="sm" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="mr-1.5 h-3.5 w-3.5" />}
            Загрузить свой файл
          </Button>
          <input ref={fileRef} type="file" accept="video/mp4,video/webm" className="hidden" onChange={onFile} />
          {element.asset && <p className="truncate text-[11px] text-muted-foreground">Прикреплено: {element.asset.kind}</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <textarea
            value={generation?.prompt ?? ''}
            onChange={(e) => onContentChange({ generation: { ...(generation ?? { source: 'image', durationSec: 5 }), prompt: e.target.value } })}
            rows={3}
            placeholder="Например: ребёнок в костюме исследователя открывает светящуюся дверь замка чисел"
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Как снимаем</span>
              <select
                value={generation?.source ?? 'image'}
                onChange={(e) => onContentChange({ generation: { ...(generation ?? { prompt: '', durationSec: 5 }), source: e.target.value as 'image' | 'text' } })}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="image">Оживить портрет ученика</option>
                <option value="text">Снять по описанию</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">Длительность</span>
              <select
                value={generation?.durationSec ?? 5}
                onChange={(e) => onContentChange({ generation: { ...(generation ?? { prompt: '', source: 'image' }), durationSec: Number(e.target.value) } })}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                {[5, 10, 15].map((sec) => <option key={sec} value={sec}>{sec} сек</option>)}
              </select>
            </label>
          </div>
          <p className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">
            {(generation?.prompt ?? '').trim().length < 8
              ? 'Опишите сцену от 8 символов — иначе ролик не сгенерируется.'
              : 'При подготовке урока ролик создастся под ученика и попадёт в его закрытую библиотеку.'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={element.content.autoplay === true} onChange={(e) => onContentChange({ autoplay: e.target.checked })} />
          автозапуск (без звука)
        </label>
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={element.content.loop === true} onChange={(e) => onContentChange({ loop: e.target.checked })} />
          зациклить
        </label>
      </div>
    </div>
  );
}

export { X as MiniGameEditorCloseIcon };
