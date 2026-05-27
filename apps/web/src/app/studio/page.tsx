'use client';

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, MapPin, Palette, Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import { buildStylePresetPrompt, getBlockCatalogItem, type PublicStylePreset } from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useGetStylePresetsQuery } from '@/store/api/public-api';
import { useListProjectsQuery } from '@/store/api/projects-api';
import {
  type UserMediaAsset,
  type UserMediaKind,
  useCreateUserMediaAssetMutation,
  useDeleteUserMediaAssetMutation,
  useGenerateUserMediaAssetMutation,
  useListUserMediaAssetsQuery,
  useUpdateUserMediaAssetMutation,
} from '@/store/api/user-media-assets-api';

type Tab = 'avatars' | 'locations' | 'history';
type ModalKind = null | { action: 'upload' | 'generate'; kind: UserMediaKind } | { action: 'variation'; asset: UserMediaAsset };

const kindLabels: Record<UserMediaKind, { title: string; empty: string; icon: typeof ImageIcon }> = {
  'user-avatar': {
    title: 'Аватары',
    empty: 'Сохраните фото лица, персонажа или будущего героя.',
    icon: ImageIcon,
  },
  'user-location': {
    title: 'Локации',
    empty: 'Сохраните места, комнаты, фоны и другие визуальные референсы.',
    icon: MapPin,
  },
};

const generationCost =
  getBlockCatalogItem('image-edit')?.supportedModels.find((model) => model.slug === 'nano-banana')?.estimatedCostCoins ?? 10;

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function originLabel(asset: UserMediaAsset) {
  return asset.tags.includes('generated') ? 'Сгенерировано' : 'Загружено';
}

function assetRefsFromInputs(value: unknown): string[] {
  const refs: string[] = [];
  const walk = (item: unknown) => {
    if (typeof item === 'string') {
      const match = item.match(/^asset:([a-zA-Z0-9_-]+)$/);
      if (match) refs.push(match[1]);
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (item && typeof item === 'object') {
      Object.values(item as Record<string, unknown>).forEach(walk);
    }
  };
  walk(value);
  return refs;
}

export default function StudioPage() {
  return (
    <AuthGuard>
      <div className="container max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <StudioContent />
      </div>
    </AuthGuard>
  );
}

function StudioContent() {
  const [tab, setTab] = useState<Tab>('avatars');
  const [modal, setModal] = useState<ModalKind>(null);
  const avatars = useListUserMediaAssetsQuery({ kind: 'user-avatar', limit: 100 });
  const locations = useListUserMediaAssetsQuery({ kind: 'user-location', limit: 100 });
  const projects = useListProjectsQuery({ page: 1, limit: 30 });
  const assetTitleById = useMemo(
    () => new Map([...(avatars.data?.items ?? []), ...(locations.data?.items ?? [])].map((asset) => [asset.id, asset.title])),
    [avatars.data?.items, locations.data?.items],
  );

  return (
    <div className="w-full max-w-full space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <Palette className="h-4 w-4" />
            Личная библиотека
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Студия</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Сохраняйте аватары и локации, чтобы потом использовать их как референсы в чате и услугах.
          </p>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Разделы студии"
        className="inline-flex w-full max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/80 p-1 shadow-inner [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto"
      >
        {[
          { id: 'avatars' as const, label: 'Аватары' },
          { id: 'locations' as const, label: 'Локации' },
          { id: 'history' as const, label: 'История генераций' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              'shrink-0 rounded-md px-3.5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white',
              tab === item.id && 'bg-violet-600 text-white shadow-sm hover:bg-violet-500',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'avatars' && (
        <AssetSection
          kind="user-avatar"
          items={avatars.data?.items ?? []}
          isLoading={avatars.isLoading}
          onUpload={() => setModal({ action: 'upload', kind: 'user-avatar' })}
          onGenerate={() => setModal({ action: 'generate', kind: 'user-avatar' })}
          onVariation={(asset) => setModal({ action: 'variation', asset })}
        />
      )}
      {tab === 'locations' && (
        <AssetSection
          kind="user-location"
          items={locations.data?.items ?? []}
          isLoading={locations.isLoading}
          onUpload={() => setModal({ action: 'upload', kind: 'user-location' })}
          onGenerate={() => setModal({ action: 'generate', kind: 'user-location' })}
          onVariation={(asset) => setModal({ action: 'variation', asset })}
        />
      )}
      {tab === 'history' && (
        <Card className="min-w-0 overflow-hidden border-slate-800 bg-slate-900">
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800">
              {(projects.data?.items ?? []).map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 p-4 transition hover:bg-slate-800/70"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-white">{project.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {formatDate(project.createdAt)} · {project.mode === 'library-generation' ? 'Генерация для библиотеки' : project.mode === 'free-chat' ? 'Allvision AI' : 'Услуга'}
                      {assetRefsFromInputs(project.userInputs).map((assetId) => assetTitleById.get(assetId)).filter(Boolean).map((title) => ` · использован аватар: ${title}`).join('')}
                    </div>
                  </div>
                  <Badge className="bg-slate-700 text-slate-100">{project.status}</Badge>
                </Link>
              ))}
              {!projects.isLoading && (projects.data?.items.length ?? 0) === 0 && (
                <div className="p-6 text-sm text-slate-500">История пока пустая.</div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {modal?.action === 'upload' && <UploadAssetModal kind={modal.kind} onClose={() => setModal(null)} />}
      {modal?.action === 'generate' && <GenerateAssetModal kind={modal.kind} onClose={() => setModal(null)} />}
      {modal?.action === 'variation' && <VariationAssetModal asset={modal.asset} onClose={() => setModal(null)} />}
    </div>
  );
}

function AssetSection({
  kind,
  items,
  isLoading,
  onUpload,
  onGenerate,
  onVariation,
}: {
  kind: UserMediaKind;
  items: UserMediaAsset[];
  isLoading: boolean;
  onUpload: () => void;
  onGenerate: () => void;
  onVariation: (asset: UserMediaAsset) => void;
}) {
  const meta = kindLabels[kind];
  const Icon = meta.icon;
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold text-white">{meta.title}</h2>
          <p className="mt-1 text-sm text-slate-400">{meta.empty}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button type="button" variant="outline" className="flex-1 sm:flex-none" onClick={onUpload}>
            <Upload className="h-4 w-4" />
            Загрузить фото
          </Button>
          <Button type="button" onClick={onGenerate} className="flex-1 bg-violet-600 hover:bg-violet-500 sm:flex-none">
            <Wand2 className="h-4 w-4" />
            Создать образ
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="h-64 min-w-0 border-slate-800 bg-slate-900" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Card className="min-w-0 overflow-hidden border-dashed border-slate-800 bg-slate-900">
          <CardContent className="flex min-h-56 flex-col items-center justify-center p-5 text-center sm:p-8">
            <Icon className="h-10 w-10 text-slate-500" />
            <div className="mt-3 font-medium text-white">Здесь пока пусто</div>
            <p className="mt-1 max-w-sm text-sm text-slate-500">{meta.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((asset) => <AssetCard key={asset.id} asset={asset} onVariation={() => onVariation(asset)} />)}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onVariation }: { asset: UserMediaAsset; onVariation: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(asset.title);
  const [updateAsset] = useUpdateUserMediaAssetMutation();
  const [deleteAsset] = useDeleteUserMediaAssetMutation();
  const isVideo = asset.mimeType.startsWith('video/');

  const save = async () => {
    try {
      await updateAsset({ id: asset.id, body: { title } }).unwrap();
      setEditing(false);
      toast({ title: 'Ассет переименован' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Удалить "${asset.title}"?`)) return;
    try {
      await deleteAsset(asset.id).unwrap();
      toast({ title: 'Ассет удален' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Card className="group min-w-0 overflow-hidden border-slate-800 bg-slate-900">
      <div className="relative aspect-square bg-slate-950">
        {isVideo ? (
          <video src={asset.publicUrl} className="h-full w-full object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl || asset.publicUrl} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/10 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
          <div className="flex w-full gap-2">
            <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setEditing(true)}>
              Переименовать
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <CardContent className="space-y-3 p-4">
        {editing ? (
          <div className="flex gap-2">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            <Button type="button" size="sm" onClick={save}>OK</Button>
          </div>
        ) : (
          <div>
            <div className="truncate font-semibold text-white">{asset.title}</div>
            <div className="mt-1 text-xs text-slate-500">{formatDate(asset.createdAt)} · {originLabel(asset)}</div>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" className="w-full" disabled>
          Использовать в услуге
        </Button>
        <Button type="button" variant="outline" size="sm" className="w-full border-violet-500/40 bg-violet-500/10" onClick={onVariation}>
          Создать вариацию
        </Button>
        {asset.variationsCount > 0 && (
          <div className="text-xs text-violet-200">у этого образа ещё {asset.variationsCount} вариации</div>
        )}
      </CardContent>
    </Card>
  );
}

function UploadAssetModal({ kind, onClose }: { kind: UserMediaKind; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [createAsset, state] = useCreateUserMediaAssetMutation();

  const changeFile = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      toast({ title: 'Выберите файл', variant: 'destructive' });
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('data', JSON.stringify({ kind, title: title.trim() || file.name }));
    try {
      await createAsset(form).unwrap();
      toast({ title: 'Фото сохранено в Студии' });
      onClose();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Modal title={`Загрузить ${kind === 'user-avatar' ? 'аватар' : 'локацию'}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label>Файл</Label>
          <Input type="file" accept="image/*" onChange={changeFile} required />
        </div>
        <div className="space-y-2">
          <Label>Название</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={state.isLoading} className="bg-violet-600 hover:bg-violet-500">
            {state.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GenerateAssetModal({ kind, onClose }: { kind: UserMediaKind; onClose: () => void }) {
  const router = useRouter();
  const me = useGetMeQuery();
  const presets = useGetStylePresetsQuery({ kind });
  const [presetSlug, setPresetSlug] = useState<string>('none');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [aspectRatio, setAspectRatio] = useState<'1:1' | '9:16' | '16:9' | 'auto'>(kind === 'user-avatar' ? '1:1' : '16:9');
  const [generate, state] = useGenerateUserMediaAssetMutation();
  const balance = me.data?.user.tokenBalance ?? 0;
  const canPay = balance >= generationCost;
  const selectedPreset = (presets.data?.presets ?? []).find((preset) => preset.slug === presetSlug);
  const finalPrompt = buildStylePresetPrompt(selectedPreset?.promptText, prompt);
  const promptRequired = presetSlug === 'none';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (finalPrompt.trim().length < 8) {
      toast({
        title: promptRequired ? 'Опишите образ' : 'Выберите шаблон или добавьте описание',
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await generate({ kind, prompt: finalPrompt, title, aspectRatio }).unwrap();
      toast({ title: 'Генерация запущена' });
      onClose();
      router.push(`/dashboard/projects/${result.project.id}`);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Modal title="Создать образ" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
          Стоимость: {generationCost} токенов · ~{generationCost} ₽. Баланс: {balance} токенов · {canPay ? 'хватит' : 'не хватает'}.
        </div>
        <div className="space-y-2">
          <Label>Название</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <StylePresetPicker
          presets={presets.data?.presets ?? []}
          selectedSlug={presetSlug}
          onSelect={setPresetSlug}
          isLoading={presets.isLoading}
        />
        <div className="space-y-2">
          <Label>{promptRequired ? 'Свой промпт' : 'Дополнение к шаблону'}</Label>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            required={promptRequired}
            placeholder={promptRequired ? 'Опишите образ своими словами...' : 'Необязательно: уточните детали, персонажа, цвет, настроение...'}
          />
          {!promptRequired && (
            <p className="text-xs leading-5 text-slate-500">
              Шаблон уже содержит основной промпт. Это поле можно оставить пустым.
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Соотношение сторон</Label>
          <select
            value={aspectRatio}
            onChange={(event) => setAspectRatio(event.target.value as typeof aspectRatio)}
            className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
          >
            <option value="1:1">1:1</option>
            <option value="9:16">9:16</option>
            <option value="16:9">16:9</option>
            <option value="auto">auto</option>
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={state.isLoading || !canPay} className="bg-violet-600 hover:bg-violet-500">
            {state.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function VariationAssetModal({ asset, onClose }: { asset: UserMediaAsset; onClose: () => void }) {
  const router = useRouter();
  const me = useGetMeQuery();
  const presets = useGetStylePresetsQuery({ kind: asset.kind });
  const [presetSlug, setPresetSlug] = useState<string>('none');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState(`${asset.title} — вариация`);
  const [generate, state] = useGenerateUserMediaAssetMutation();
  const balance = me.data?.user.tokenBalance ?? 0;
  const canPay = balance >= generationCost;
  const selectedPreset = (presets.data?.presets ?? []).find((preset) => preset.slug === presetSlug);
  const finalPrompt = buildStylePresetPrompt(selectedPreset?.promptText, prompt);
  const promptRequired = presetSlug === 'none';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (finalPrompt.trim().length < 8) {
      toast({
        title: promptRequired ? 'Опишите вариацию' : 'Выберите шаблон или добавьте описание',
        variant: 'destructive',
      });
      return;
    }
    try {
      const result = await generate({
        kind: asset.kind,
        prompt: finalPrompt,
        title,
        aspectRatio: asset.kind === 'user-avatar' ? '1:1' : '16:9',
        parentAssetId: asset.id,
      }).unwrap();
      toast({ title: 'Вариация запущена' });
      onClose();
      router.push(`/dashboard/projects/${result.project.id}`);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Modal title="Создать вариацию" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-3 rounded-md border border-slate-800 bg-slate-950 p-3">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-slate-900">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.thumbnailUrl || asset.publicUrl} alt="" className="h-full w-full object-cover" />
          </div>
          <div>
            <div className="font-medium text-white">{asset.title}</div>
            <div className="mt-1 text-sm text-slate-500">Исходный образ будет использован как image input.</div>
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300">
          Стоимость: {generationCost} токенов · ~{generationCost} ₽. Баланс: {balance} токенов · {canPay ? 'хватит' : 'не хватает'}.
        </div>
        <div className="space-y-2">
          <Label>Название</Label>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </div>
        <StylePresetPicker
          presets={presets.data?.presets ?? []}
          selectedSlug={presetSlug}
          onSelect={setPresetSlug}
          isLoading={presets.isLoading}
        />
        <div className="space-y-2">
          <Label>{promptRequired ? 'Свой промпт' : 'Дополнение к шаблону'}</Label>
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={5}
            required={promptRequired}
            placeholder={promptRequired ? 'Опишите вариацию своими словами...' : 'Необязательно: уточните, что изменить относительно исходного образа...'}
          />
          {!promptRequired && (
            <p className="text-xs leading-5 text-slate-500">
              Шаблон уже задаёт стиль вариации. Поле можно оставить пустым.
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Отмена</Button>
          <Button type="submit" disabled={state.isLoading || !canPay} className="bg-violet-600 hover:bg-violet-500">
            {state.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Создать вариацию
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StylePresetPicker({
  presets,
  selectedSlug,
  onSelect,
  isLoading,
}: {
  presets: PublicStylePreset[];
  selectedSlug: string;
  onSelect: (slug: string) => void;
  isLoading?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>Шаблоны</Label>
      <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect('none')}
          className={cn(
            'rounded-md border p-3 text-left transition',
            selectedSlug === 'none' ? 'border-violet-500 bg-violet-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700',
          )}
        >
          <div className="font-medium text-white">Без шаблона</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">Использовать только ваш промпт.</div>
        </button>
        {isLoading ? (
          <div className="rounded-md border border-slate-800 bg-slate-950 p-3 text-sm text-slate-500">Загрузка...</div>
        ) : presets.map((preset) => (
          <button
            key={preset.slug}
            type="button"
            onClick={() => onSelect(preset.slug)}
            className={cn(
              'overflow-hidden rounded-md border text-left transition',
              selectedSlug === preset.slug ? 'border-violet-500 bg-violet-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700',
            )}
          >
            {preset.thumbnail && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preset.thumbnail} alt="" className="aspect-video w-full object-cover" />
            )}
            <div className="p-3">
              <div className="font-medium text-white">{preset.title}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{preset.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>x</Button>
        </div>
        {children}
      </div>
    </div>
  );
}
