'use client';

import { useMemo, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  type AdminMediaAsset,
  useCreateAdminMediaAssetMutation,
  useDeleteAdminMediaAssetMutation,
  useListAdminMediaAssetsQuery,
  useReorderAdminMediaAssetMutation,
  useUpdateAdminMediaAssetMutation,
} from '@/store/api/admin-media-assets-api';

const kinds = ['trend-video', 'preview-image', 'music-track', 'user-avatar', 'user-location'];

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function thumbnailUrl(asset: AdminMediaAsset) {
  if (!asset.thumbnailKey) return null;
  const base = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');
  return `${base}/static/${asset.thumbnailKey}`;
}

export default function AdminMediaAssetsPage() {
  const [kind, setKind] = useState('trend-video');
  const [isActive, setIsActive] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState({ kind: 'trend-video', title: '', description: '', tags: '' });
  const [file, setFile] = useState<File | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const query = useMemo(() => ({
    kind: kind || undefined,
    isActive: isActive === 'all' ? undefined : isActive === 'true',
    search: search || undefined,
  }), [kind, isActive, search]);
  const { data, isFetching, refetch } = useListAdminMediaAssetsQuery(query);
  const [createAsset, createState] = useCreateAdminMediaAssetMutation();
  const [updateAsset] = useUpdateAdminMediaAssetMutation();
  const [deleteAsset] = useDeleteAdminMediaAssetMutation();
  const [reorderAsset] = useReorderAdminMediaAssetMutation();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast({ title: 'Choose a file', variant: 'destructive' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('data', JSON.stringify({ ...draft, tags: draft.tags }));
    try {
      await createAsset(form).unwrap();
      setDraft({ kind: 'trend-video', title: '', description: '', tags: '' });
      setFile(null);
      toast({ title: 'Медиа-файл загружен' });
    } catch (error) {
      toast({
        title: (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Загрузка не удалась',
        variant: 'destructive',
      });
    }
  };

  const changeFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
  };

  const toggle = async (asset: AdminMediaAsset) => {
    await updateAsset({ id: asset.id, body: { isActive: !asset.isActive } }).unwrap();
  };

  const remove = async (asset: AdminMediaAsset) => {
    if (!window.confirm(`Delete ${asset.title}?`)) return;
    try {
      await deleteAsset(asset.id).unwrap();
    } catch (error) {
      toast({
        title: (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Delete failed',
        variant: 'destructive',
      });
    }
  };

  const startDrag = (event: DragEvent<HTMLTableRowElement>, asset: AdminMediaAsset) => {
    setDraggingId(asset.id);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', asset.id);
  };

  const dropOnAsset = async (event: DragEvent<HTMLTableRowElement>, target: AdminMediaAsset) => {
    event.preventDefault();
    const sourceId = draggingId ?? event.dataTransfer.getData('text/plain');
    setDraggingId(null);
    if (!sourceId || sourceId === target.id) return;
    const current = data?.items ?? [];
    const source = current.find((asset) => asset.id === sourceId);
    if (!source) return;
    const withoutSource = current.filter((asset) => asset.id !== sourceId);
    const targetIndex = withoutSource.findIndex((asset) => asset.id === target.id);
    const reordered = [
      ...withoutSource.slice(0, targetIndex),
      source,
      ...withoutSource.slice(targetIndex),
    ];
    await Promise.all(reordered.map((asset, index) => reorderAsset({ id: asset.id, sortOrder: index }).unwrap()));
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Медиа-файлы</h1>
          <p className="mt-2 text-sm text-slate-400">Загрузка и управление трендовыми видео, превью и будущими медиа-источниками.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
          Обновить
        </Button>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="space-y-2">
            <Label>Тип</Label>
            <select
              value={draft.kind}
              onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
              className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
            >
              {kinds.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label>Теги</Label>
            <Input value={draft.tags} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="dance, meme" />
          </div>
          <div className="space-y-2">
            <Label>Файл</Label>
            <Input type="file" accept="image/*,video/*,audio/*" onChange={changeFile} required />
          </div>
          <div className="space-y-2 lg:col-span-4">
            <Label>Описание</Label>
            <Textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={2} />
          </div>
        </div>
        <Button type="submit" disabled={createState.isLoading} className="mt-4 bg-rose-500 hover:bg-rose-400">
          <Upload className="h-4 w-4" />
          Загрузить медиа-файл
        </Button>
      </form>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label>Фильтр по типу</Label>
          <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100">
            <option value="">all</option>
            {kinds.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Activity</Label>
          <select value={isActive} onChange={(event) => setIsActive(event.target.value)} className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100">
            <option value="all">all</option>
            <option value="true">активные</option>
            <option value="false">скрытые</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Поиск</Label>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="название или тег" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-slate-400">
            <tr>
              <th className="p-3">Asset</th>
              <th className="p-3">Meta</th>
              <th className="p-3">Владелец</th>
              <th className="p-3">Статус</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {(data?.items ?? []).map((asset) => {
              const thumb = thumbnailUrl(asset);
              return (
                <tr
                  key={asset.id}
                  draggable
                  onDragStart={(event) => startDrag(event, asset)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnd={() => setDraggingId(null)}
                  onDrop={(event) => dropOnAsset(event, asset)}
                  className={`bg-zinc-900/60 ${draggingId === asset.id ? 'opacity-50' : ''}`}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-slate-500" aria-hidden />
                      <div className="grid h-16 w-24 place-items-center overflow-hidden rounded-md bg-zinc-950">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : asset.mimeType.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.publicUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-xs text-slate-500">{asset.kind}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{asset.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{asset.kind} / {asset.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 text-slate-300">
                    <div>{formatBytes(asset.fileSize)} / {asset.mimeType}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {asset.durationSec ? `${asset.durationSec.toFixed(1)}s / ` : ''}
                      {asset.width && asset.height ? `${asset.width}x${asset.height}` : 'no dimensions'}
                    </div>
                  </td>
                  <td className="p-3 text-sm text-slate-300">
                    {asset.owner ? (
                      <div>
                        <div>{asset.owner.email}</div>
                        <div className="mt-1 text-xs text-slate-500">{asset.ownerUserId}</div>
                      </div>
                    ) : (
                      <span className="text-slate-500">Общий ассет</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge className={asset.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>{asset.isActive ? 'активен' : 'скрыт'}</Badge>
                    <div className="mt-2 text-xs text-slate-500">порядок {asset.sortOrder}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" size="icon" onClick={() => reorderAsset({ id: asset.id, direction: 'up' })} aria-label="Move up">
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" size="icon" onClick={() => reorderAsset({ id: asset.id, direction: 'down' })} aria-label="Move down">
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="outline" onClick={() => toggle(asset)}>
                        {asset.isActive ? 'Скрыть' : 'Включить'}
                      </Button>
                      <Button type="button" variant="destructive" size="icon" onClick={() => remove(asset)} aria-label="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isFetching && (data?.items.length ?? 0) === 0 && (
              <tr><td colSpan={5} className="p-8 text-center text-slate-500">Медиа-файлов пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
