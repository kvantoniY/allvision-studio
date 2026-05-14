'use client';

import { useState, type FormEvent } from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  type AdminStylePreset,
  useCreateAdminStylePresetMutation,
  useDeleteAdminStylePresetMutation,
  useListAdminStylePresetsQuery,
  useUpdateAdminStylePresetMutation,
} from '@/store/api/admin-style-presets-api';

type Kind = 'user-avatar' | 'user-location';

const emptyDraft = {
  slug: '',
  kind: 'user-avatar' as Kind,
  title: '',
  description: '',
  promptText: '',
  thumbnail: '',
  sortOrder: 0,
  isActive: true,
};

function errorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function AdminStylePresetsPage() {
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const { data, isFetching } = useListAdminStylePresetsQuery(kind === 'all' ? undefined : { kind });
  const [createPreset, createState] = useCreateAdminStylePresetMutation();
  const [draft, setDraft] = useState(emptyDraft);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createPreset({
        ...draft,
        thumbnail: draft.thumbnail.trim() || null,
        sortOrder: Number(draft.sortOrder) || 0,
      }).unwrap();
      setDraft(emptyDraft);
      toast({ title: 'Шаблон создан' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-rose-300">
          <Palette className="h-4 w-4" />
          Шаблоны образов
        </div>
        <h1 className="mt-2 text-3xl font-bold text-white">Шаблоны образов</h1>
        <p className="mt-2 text-sm text-slate-400">Редактируемые style presets для генерации аватаров и локаций в Студии.</p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Тип</Label>
            <select
              value={draft.kind}
              onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as Kind }))}
              className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
            >
              <option value="user-avatar">Аватар</option>
              <option value="user-location">Локация</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Порядок</Label>
            <Input type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Краткое описание</Label>
            <Textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} required />
          </div>
          <div className="space-y-2 lg:col-span-2">
            <Label>Thumbnail URL</Label>
            <Input value={draft.thumbnail} onChange={(event) => setDraft((current) => ({ ...current, thumbnail: event.target.value }))} />
          </div>
          <div className="space-y-2 lg:col-span-4">
            <Label>Prompt fragment</Label>
            <Textarea value={draft.promptText} onChange={(event) => setDraft((current) => ({ ...current, promptText: event.target.value }))} rows={5} required />
          </div>
        </div>
        <Button type="submit" disabled={createState.isLoading} className="mt-4 bg-rose-500 hover:bg-rose-400">
          <Plus className="h-4 w-4" />
          Создать шаблон
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {[
          { value: 'all' as const, label: 'Все' },
          { value: 'user-avatar' as const, label: 'Аватары' },
          { value: 'user-location' as const, label: 'Локации' },
        ].map((item) => (
          <Button key={item.value} type="button" variant={kind === item.value ? 'default' : 'outline'} onClick={() => setKind(item.value)}>
            {item.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4">
        {(data?.items ?? []).map((preset) => <PresetRow key={preset.id} preset={preset} />)}
        {!isFetching && (data?.items.length ?? 0) === 0 && (
          <Card className="border-dashed border-zinc-800 bg-zinc-950">
            <CardContent className="p-8 text-center text-sm text-slate-500">Шаблонов пока нет</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PresetRow({ preset }: { preset: AdminStylePreset }) {
  const [draft, setDraft] = useState({
    kind: preset.kind,
    title: preset.title,
    description: preset.description,
    promptText: preset.promptText,
    thumbnail: preset.thumbnail ?? '',
    sortOrder: preset.sortOrder,
    isActive: preset.isActive,
  });
  const [updatePreset, updateState] = useUpdateAdminStylePresetMutation();
  const [deletePreset] = useDeleteAdminStylePresetMutation();

  const save = async () => {
    try {
      await updatePreset({
        id: preset.id,
        body: { ...draft, thumbnail: draft.thumbnail.trim() || null, sortOrder: Number(draft.sortOrder) || 0 },
      }).unwrap();
      toast({ title: 'Шаблон обновлён' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Удалить шаблон "${preset.title}"?`)) return;
    await deletePreset(preset.id).unwrap();
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-white">{preset.slug}</h2>
              <Badge className={preset.kind === 'user-avatar' ? 'bg-violet-600' : 'bg-emerald-600'}>
                {preset.kind === 'user-avatar' ? 'Аватар' : 'Локация'}
              </Badge>
              <Badge className={draft.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>{draft.isActive ? 'активен' : 'скрыт'}</Badge>
            </div>
          </div>
          <Button type="button" variant="destructive" size="icon" onClick={remove} aria-label="Удалить">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
          <select
            value={draft.kind}
            onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as Kind }))}
            className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
          >
            <option value="user-avatar">Аватар</option>
            <option value="user-location">Локация</option>
          </select>
          <Input type="number" value={draft.sortOrder} onChange={(event) => setDraft((current) => ({ ...current, sortOrder: Number(event.target.value) }))} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.checked }))} />
            Активен
          </label>
          <Textarea className="lg:col-span-2" value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={3} />
          <Input className="lg:col-span-2" value={draft.thumbnail} onChange={(event) => setDraft((current) => ({ ...current, thumbnail: event.target.value }))} placeholder="Thumbnail URL" />
          <Textarea className="lg:col-span-4" value={draft.promptText} onChange={(event) => setDraft((current) => ({ ...current, promptText: event.target.value }))} rows={5} />
        </div>

        <Button type="button" disabled={updateState.isLoading} onClick={save} className="bg-rose-500 hover:bg-rose-400">
          Сохранить
        </Button>
      </CardContent>
    </Card>
  );
}
