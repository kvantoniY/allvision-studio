'use client';

import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, MapPin, Plus, RotateCcw, Trash2, Upload, Video, Wand2 } from 'lucide-react';
import { buildStylePresetPrompt, getBlockCatalogItem, tokensToRub, type PublicStylePreset } from '@allvision/shared';
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
import { type ProjectListItem, useListProjectsQuery } from '@/store/api/projects-api';
import { PROJECT_STATUS_COLOR, PROJECT_STATUS_LABEL } from '@/components/dashboard/labels';
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
const generationCostRub = tokensToRub(generationCost);
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

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

function flattenAssets(items: UserMediaAsset[]) {
  return items.flatMap((asset) => [asset, ...(asset.variations ?? [])]);
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
    () => new Map(flattenAssets([...(avatars.data?.items ?? []), ...(locations.data?.items ?? [])]).map((asset) => [asset.id, asset.title])),
    [avatars.data?.items, locations.data?.items],
  );

  return (
    <div className="w-full max-w-full space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Студия</h1>
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
        <StudioHistory
          projects={projects.data?.items ?? []}
          isLoading={projects.isLoading}
          assetTitleById={assetTitleById}
        />
      )}
      {false && tab === 'history' && (
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

function projectMedia(project: ProjectListItem): { type: 'image' | 'video'; url: string } | null {
  const resultVideo = mediaUrl(project.resultVideo);
  if (resultVideo) return { type: 'video', url: resultVideo };
  if (project.resultThumbnail || project.resultImage) {
    return { type: 'image', url: mediaUrl(project.resultThumbnail ?? project.resultImage)! };
  }
  const service = project.service;
  const serviceImage = mediaUrl(service?.previewImage ?? service?.coverImage ?? service?.galleryImages?.[0] ?? null);
  const serviceVideo = mediaUrl(service?.previewVideo ?? null);
  if (service?.previewMode !== 'image' && serviceVideo) return { type: 'video', url: serviceVideo };
  if (serviceImage) return { type: 'image', url: serviceImage };
  const inputImage = mediaUrl(project.inputImages[0]);
  if (inputImage) return { type: 'image', url: inputImage };
  return null;
}

function retryHref(project: ProjectListItem) {
  if (project.service?.slug) return `/services/${project.service.slug}`;
  if (project.mode === 'free-chat') return '/ai';
  if (project.mode === 'library-generation') return '/studio';
  return '/services';
}

function projectModeLabel(project: ProjectListItem) {
  if (project.mode === 'library-generation') return 'Генерация для Студии';
  if (project.mode === 'free-chat') return 'Allvision AI';
  return project.service?.title ?? 'Услуга';
}

function StudioHistory({
  projects,
  isLoading,
  assetTitleById,
}: {
  projects: ProjectListItem[];
  isLoading: boolean;
  assetTitleById: Map<string, string>;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="h-64 min-w-0 border-slate-800 bg-slate-900" />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="min-w-0 overflow-hidden border-dashed border-slate-800 bg-slate-900">
        <CardContent className="p-6 text-sm text-slate-500">История пока пустая.</CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const media = projectMedia(project);
        const usedAssets = assetRefsFromInputs(project.userInputs)
          .map((assetId) => assetTitleById.get(assetId))
          .filter((title): title is string => Boolean(title));
        return (
          <Card key={project.id} className="min-w-0 overflow-hidden border-slate-800 bg-slate-900">
            <div className="relative aspect-video bg-slate-950">
              <Link href={`/dashboard/projects/${project.id}`} className="block h-full">
                {media?.type === 'video' ? (
                  <video src={media.url} muted preload="metadata" className="h-full w-full object-cover" />
                ) : media?.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={media.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center text-slate-600">
                    <Video className="h-10 w-10" />
                  </div>
                )}
              </Link>
              <Badge className={cn('absolute right-2 top-2 rounded-md px-2 py-1 text-xs font-medium', PROJECT_STATUS_COLOR[project.status])}>
                {PROJECT_STATUS_LABEL[project.status]}
              </Badge>
            </div>
            <CardContent className="space-y-3 p-4">
              <Link href={`/dashboard/projects/${project.id}`} className="block">
                <div className="line-clamp-1 font-semibold text-white">{project.title}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDate(project.createdAt)} · {projectModeLabel(project)}
                </div>
              </Link>
              <div className="space-y-1 text-xs text-slate-500">
                <div>{project.tokensCost} токенов</div>
                {usedAssets.length > 0 && <div className="line-clamp-1">Референс: {usedAssets.join(', ')}</div>}
                {project.errorMessage && <div className="line-clamp-2 text-amber-200">{project.errorMessage}</div>}
              </div>
              {project.status === 'PROCESSING' && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${project.progress ?? 0}%` }} />
                </div>
              )}
              {project.status === 'FAILED' && (
                <Button asChild size="sm" variant="outline" className="w-full border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20">
                  <Link href={retryHref(project)}>
                    <RotateCcw className="h-4 w-4" />
                    Повторить
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
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
  const [selectedId, setSelectedId] = useState(asset.id);
  const [updateAsset] = useUpdateUserMediaAssetMutation();
  const [deleteAsset] = useDeleteUserMediaAssetMutation();
  const variants = [asset, ...(asset.variations ?? [])];
  const selectedAsset = variants.find((item) => item.id === selectedId) ?? asset;
  const isVideo = selectedAsset.mimeType.startsWith('video/');

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
          <video src={selectedAsset.publicUrl} className="h-full w-full object-cover" muted playsInline />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={selectedAsset.thumbnailUrl || selectedAsset.publicUrl} alt="" className="h-full w-full object-cover" />
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
            <div className="truncate font-semibold text-white">{selectedAsset.title}</div>
            <div className="mt-1 text-xs text-slate-500">{formatDate(selectedAsset.createdAt)} · {originLabel(selectedAsset)}</div>
          </div>
        )}
        {variants.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {variants.map((variant, index) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => setSelectedId(variant.id)}
                className={cn(
                  'h-12 w-12 shrink-0 overflow-hidden rounded-md border bg-slate-950',
                  selectedId === variant.id ? 'border-violet-400 ring-1 ring-violet-400/50' : 'border-slate-800',
                )}
                title={index === 0 ? 'Основной образ' : `Вариация ${index}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={variant.thumbnailUrl || variant.publicUrl} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
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

function AvatarModelPicker({
  value,
  onChange,
}: {
  value: 'nano-banana' | 'gpt-image-2';
  onChange: (model: 'nano-banana' | 'gpt-image-2') => void;
}) {
  const options: Array<{ id: 'nano-banana' | 'gpt-image-2'; label: string }> = [
    { id: 'nano-banana', label: 'Стандарт (Nano Banana)' },
    { id: 'gpt-image-2', label: 'GPT Image 2 (бета)' },
  ];
  return (
    <div className="space-y-2">
      <Label>Движок генерации</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
              value === opt.id
                ? 'border-violet-500 bg-violet-500/10 text-white'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {value === 'gpt-image-2' && (
        <p className="text-xs leading-5 text-amber-300/80">
          Бета: у GPT Image сейчас бывают сбои у провайдера. Если генерация не проходит — выберите «Стандарт (Nano Banana)».
        </p>
      )}
    </div>
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
  const [model, setModel] = useState<'nano-banana' | 'gpt-image-2'>('nano-banana');
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
      const result = await generate({ kind, prompt: finalPrompt, title, aspectRatio, model: kind === 'user-avatar' ? model : 'nano-banana' }).unwrap();
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
          Стоимость: {generationCost} токенов · ~{generationCostRub} ₽. Баланс: {balance} токенов · {canPay ? 'хватит' : 'не хватает'}.
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
        {kind === 'user-avatar' && <AvatarModelPicker value={model} onChange={setModel} />}
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
  const [model, setModel] = useState<'nano-banana' | 'gpt-image-2'>('nano-banana');
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
        model: asset.kind === 'user-avatar' ? model : 'nano-banana',
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
          Стоимость: {generationCost} токенов · ~{generationCostRub} ₽. Баланс: {balance} токенов · {canPay ? 'хватит' : 'не хватает'}.
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
        {asset.kind === 'user-avatar' && <AvatarModelPicker value={model} onChange={setModel} />}
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>x</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
