'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { FilePlus2, ImageIcon, Link2, Music2, Upload, UserRound, Video } from 'lucide-react';
import {
  buildAssetSourceValue,
  buildStepSourceValue,
  buildUserSourceValue,
  parseSourceValue,
  type SourceMediaKind,
} from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  type AdminMediaAsset,
  useCreateAdminMediaAssetMutation,
  useListAdminMediaAssetsQuery,
} from '@/store/api/admin-media-assets-api';
import type { UserInputField } from '@/store/api/admin-services-api';

export type AvailableSourceStep = {
  id: string;
  title: string;
  outputKind?: SourceMediaKind;
};

type SourceSelectorProps = {
  value: string;
  onChange: (newValue: string) => void;
  mediaKind: SourceMediaKind;
  userInputFields: UserInputField[];
  availableSteps: AvailableSourceStep[];
  label?: string;
  description?: string;
};

const mediaKinds: Record<SourceMediaKind, { primary: string; extra: string[]; uploadKinds: string[] }> = {
  image: { primary: 'preview-image', extra: [], uploadKinds: ['preview-image'] },
  video: { primary: 'trend-video', extra: [], uploadKinds: ['trend-video'] },
  audio: { primary: 'music-track', extra: [], uploadKinds: ['music-track'] },
};

function SourceKindIcon({ mediaKind }: { mediaKind: SourceMediaKind }) {
  if (mediaKind === 'image') return <ImageIcon className="h-4 w-4 text-slate-400" />;
  if (mediaKind === 'video') return <Video className="h-4 w-4 text-slate-400" />;
  return <Music2 className="h-4 w-4 text-slate-400" />;
}

function sourceKindLabel(mediaKind: SourceMediaKind) {
  if (mediaKind === 'image') return 'изображение';
  if (mediaKind === 'video') return 'видео';
  return 'аудио';
}

export function SourceSelector({
  value,
  onChange,
  mediaKind,
  userInputFields,
  availableSteps,
  label,
  description,
}: SourceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadDraft, setUploadDraft] = useState({ title: '', description: '', tags: '', kind: mediaKinds[mediaKind].primary });
  const [file, setFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [createAsset, createState] = useCreateAdminMediaAssetMutation();
  const primary = useListAdminMediaAssetsQuery({ kind: mediaKinds[mediaKind].primary, isActive: true, limit: 100 });
  const extras = mediaKinds[mediaKind].extra;
  const secondary = useListAdminMediaAssetsQuery(
    extras[0] ? { kind: extras[0], isActive: true, limit: 100 } : { kind: mediaKinds[mediaKind].primary, isActive: true, limit: 1 },
    { skip: !extras[0] },
  );

  const parsed = parseSourceValue(value);
  const userOptions = useMemo(
    () => userInputFields.filter((field) => userFieldMatchesMedia(field, mediaKind)),
    [mediaKind, userInputFields],
  );
  const stepOptions = useMemo(
    () => availableSteps.filter((step) => !step.outputKind || step.outputKind === mediaKind),
    [availableSteps, mediaKind],
  );
  const assets = useMemo(() => {
    const map = new Map<string, AdminMediaAsset>();
    for (const asset of primary.data?.items ?? []) map.set(asset.id, asset);
    for (const asset of secondary.data?.items ?? []) map.set(asset.id, asset);
    return Array.from(map.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  }, [primary.data?.items, secondary.data?.items]);
  const selectedAsset = parsed.kind === 'asset' ? assets.find((asset) => asset.id === parsed.id) : undefined;
  const currentLabel = describeCurrentValue(parsed, userInputFields, availableSteps, selectedAsset);
  const isPlainValue = parsed.kind === 'plain';

  const selectValue = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    if (nextFile && !uploadDraft.title) {
      setUploadDraft((current) => ({ ...current, title: nextFile.name.replace(/\.[^.]+$/, '') }));
    }
  };

  const upload = async () => {
    if (!file) {
      setUploadError('Выберите файл');
      return;
    }
    if (!uploadDraft.title.trim()) {
      setUploadError('Укажите название');
      return;
    }
    setUploadError(null);
    try {
      const body = new FormData();
      body.append('data', JSON.stringify({
        kind: uploadDraft.kind,
        title: uploadDraft.title.trim(),
        description: uploadDraft.description.trim() || undefined,
        tags: uploadDraft.tags,
      }));
      body.append('file', file);
      const result = await createAsset(body).unwrap();
      onChange(buildAssetSourceValue(result.asset.id));
      setUploadOpen(false);
      setOpen(false);
      setFile(null);
      setUploadDraft({ title: '', description: '', tags: '', kind: mediaKinds[mediaKind].primary });
    } catch (err) {
      setUploadError(apiErrorMessage(err));
    }
  };

  return (
    <div className="relative space-y-2">
      {label && <Label>{label}</Label>}
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        className={cn(
          'flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-sm text-slate-100 hover:border-rose-500',
          isPlainValue && 'border-amber-800 bg-amber-950/20',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <SourceKindIcon mediaKind={mediaKind} />
          <span className="truncate">{currentLabel}</span>
        </span>
        <span className="text-xs text-slate-500">{sourceKindLabel(mediaKind)}</span>
      </button>
      {description && <p className="text-xs text-slate-500">{description}</p>}

      {open && (
        <div className="absolute z-40 mt-2 max-h-[520px] w-full overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl shadow-black/40">
          <SourceSection title="Источник от юзера">
            {userOptions.length === 0 && <EmptySourceText>Нет совместимых полей формы</EmptySourceText>}
            {userOptions.map((field) => (
              <SourceButton key={field.id} active={parsed.kind === 'user' && parsed.id === field.id} onClick={() => selectValue(buildUserSourceValue(field.id))}>
                <UserRound className="h-4 w-4 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-100">{field.label}</span>
                  <span className="block truncate text-xs text-slate-500">Юзер заполнит при заказе · {field.id}</span>
                </span>
              </SourceButton>
            ))}
          </SourceSection>

          <SourceSection title="Результат предыдущего шага">
            {stepOptions.length === 0 && <EmptySourceText>Пока нет совместимых предыдущих шагов</EmptySourceText>}
            {stepOptions.map((step) => (
              <SourceButton key={step.id} active={parsed.kind === 'step' && parsed.id === step.id} onClick={() => selectValue(buildStepSourceValue(step.id))}>
                <Link2 className="h-4 w-4 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-100">{step.title}</span>
                  <span className="block truncate text-xs text-slate-500">{step.id}.output</span>
                </span>
              </SourceButton>
            ))}
          </SourceSection>

          <SourceSection title="Из библиотеки медиа">
            {(primary.isFetching || secondary.isFetching) && <EmptySourceText>Загрузка библиотеки...</EmptySourceText>}
            {!primary.isFetching && !secondary.isFetching && assets.length === 0 && <EmptySourceText>В библиотеке пока нет подходящих файлов</EmptySourceText>}
            {assets.map((asset) => (
              <SourceButton key={asset.id} active={parsed.kind === 'asset' && parsed.id === asset.id} onClick={() => selectValue(buildAssetSourceValue(asset.id))}>
                <AssetPreview asset={asset} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-slate-100">{asset.title}</span>
                  <span className="block truncate text-xs text-slate-500">{assetMeta(asset)}</span>
                </span>
                <Badge className="bg-zinc-800 text-[10px] text-slate-300">{asset.kind}</Badge>
              </SourceButton>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setUploadOpen(true)} className="mt-2 w-full">
              <FilePlus2 className="h-4 w-4" />
              Загрузить новый файл
            </Button>
          </SourceSection>

          <details className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-3" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}>
            <summary className="cursor-pointer text-sm font-medium text-slate-100">Расширенный режим</summary>
            <div className="mt-3 space-y-2">
              <Input value={value} onChange={(event) => onChange(event.target.value)} className="font-mono" placeholder="{{user.photo}}, {{step_1.output}}, asset:id или URL" />
              <p className="text-xs text-slate-500">Для нестандартных сценариев можно оставить ручной placeholder или прямой URL.</p>
            </div>
          </details>
        </div>
      )}

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Загрузить файл в библиотеку</h3>
                <p className="mt-1 text-sm text-slate-500">После загрузки файл сразу станет выбранным источником.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setUploadOpen(false)}>x</Button>
            </div>
            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label>Файл</Label>
                <Input type="file" accept={mediaKind === 'image' ? 'image/*' : mediaKind === 'video' ? 'video/*' : 'audio/*'} onChange={onFileChange} />
              </div>
              <div className="space-y-2">
                <Label>Тип библиотеки</Label>
                <select
                  value={uploadDraft.kind}
                  onChange={(event) => setUploadDraft((current) => ({ ...current, kind: event.target.value }))}
                  className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
                >
                  {mediaKinds[mediaKind].uploadKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Название</Label>
                <Input value={uploadDraft.title} onChange={(event) => setUploadDraft((current) => ({ ...current, title: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Описание</Label>
                <Textarea rows={3} value={uploadDraft.description} onChange={(event) => setUploadDraft((current) => ({ ...current, description: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Теги</Label>
                <Input value={uploadDraft.tags} onChange={(event) => setUploadDraft((current) => ({ ...current, tags: event.target.value }))} placeholder="dance, trend, portrait" />
              </div>
              {uploadError && <div className="rounded-md border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-100">{uploadError}</div>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>Отмена</Button>
              <Button type="button" disabled={createState.isLoading} onClick={upload} className="bg-rose-500 hover:bg-rose-400">
                <Upload className="h-4 w-4" />
                Загрузить
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2 border-b border-zinc-800 py-3 last:border-b-0">
      <div className="text-xs font-semibold uppercase text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function SourceButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left text-sm hover:border-rose-500 hover:bg-zinc-900',
        active && 'border-rose-500 bg-rose-500/10',
      )}
    >
      {children}
    </button>
  );
}

function EmptySourceText({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-zinc-800 p-3 text-sm text-slate-500">{children}</div>;
}

function AssetPreview({ asset }: { asset: AdminMediaAsset }) {
  const thumb = asset.thumbnailKey ? thumbnailUrl(asset) : asset.mimeType.startsWith('image/') ? asset.publicUrl : null;
  if (thumb) return <img src={thumb} alt="" className="h-11 w-11 rounded-md object-cover" />;
  return (
    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-zinc-800">
      {asset.mimeType.startsWith('video/')
        ? <Video className="h-5 w-5 text-slate-400" />
        : asset.mimeType.startsWith('audio/')
          ? <Music2 className="h-5 w-5 text-slate-400" />
          : <ImageIcon className="h-5 w-5 text-slate-400" />}
    </div>
  );
}

function thumbnailUrl(asset: AdminMediaAsset) {
  if (!asset.thumbnailKey) return asset.publicUrl;
  const marker = '/static/';
  const index = asset.publicUrl.indexOf(marker);
  if (index === -1) return asset.publicUrl;
  return `${asset.publicUrl.slice(0, index + marker.length)}${asset.thumbnailKey}`;
}

function assetMeta(asset: AdminMediaAsset) {
  const parts: string[] = [];
  if (asset.width && asset.height) parts.push(`${asset.width}x${asset.height}`);
  if (asset.durationSec) parts.push(`${Math.round(asset.durationSec)} с`);
  if (asset.fileSize) parts.push(`${Math.round(asset.fileSize / 1024)} KB`);
  return parts.join(' · ') || asset.mimeType;
}

function userFieldMatchesMedia(field: UserInputField, mediaKind: SourceMediaKind) {
  if (mediaKind === 'image') {
    if (field.type === 'photo' || field.type === 'avatar') return true;
    return field.type === 'media-select' && Boolean(field.mediaKind?.includes('image'));
  }
  if (mediaKind === 'audio') {
    return field.type === 'media-select' && Boolean(field.mediaKind?.includes('audio') || field.mediaKind?.includes('music'));
  }
  return field.type === 'media-select' && Boolean(field.mediaKind?.includes('video'));
}

function describeCurrentValue(
  parsed: ReturnType<typeof parseSourceValue>,
  fields: UserInputField[],
  steps: AvailableSourceStep[],
  asset?: AdminMediaAsset,
) {
  if (parsed.kind === 'empty') return 'Источник не выбран';
  if (parsed.kind === 'user') {
    const field = fields.find((item) => item.id === parsed.id);
    return field ? `От юзера: ${field.label}` : `От юзера: ${parsed.id}`;
  }
  if (parsed.kind === 'step') {
    const index = steps.findIndex((step) => step.id === parsed.id);
    const step = steps[index];
    return step ? `Результат шага ${index + 1}: ${step.title}` : `Результат ${parsed.id}`;
  }
  if (parsed.kind === 'asset') return asset ? `Из библиотеки: ${asset.title}` : `Из библиотеки: ${parsed.id}`;
  return `Ручное значение: ${parsed.raw}`;
}

function apiErrorMessage(error: unknown) {
  const maybe = error as { data?: { error?: { message?: string } } };
  return maybe.data?.error?.message ?? 'Не удалось загрузить файл';
}
