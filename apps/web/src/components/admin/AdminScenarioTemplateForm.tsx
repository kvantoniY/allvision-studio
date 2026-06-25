'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ScenarioTemplate } from '@allvision/shared';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { templateCategories } from '@/components/studio/v3-labels';
import { toast } from '@/hooks/use-toast';
import {
  useCreateAdminScenarioTemplateMutation,
  useDeleteAdminScenarioTemplateMutation,
  useUpdateAdminScenarioTemplateMutation,
} from '@/store/api/admin-scenario-templates-api';

type CharacterRole = {
  role: string;
  label: string;
  required: boolean;
};

type AdminScenarioTemplateFormProps = {
  mode: 'create' | 'edit';
  template?: ScenarioTemplate;
};

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'INVALID_AI_CONFIG') return 'aiConfig должен быть JSON-объектом';
  if (code === 'INVALID_CHARACTER_ROLES') return 'Проверьте роли персонажей';
  if (code === 'TEMPLATE_IN_USE') return 'Невозможно удалить: шаблон используется в активных эпизодах';
  if (code === 'SLUG_ALREADY_EXISTS') return 'Шаблон с таким slug уже существует';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось сохранить шаблон';
}

function prettyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function rolesFromTemplate(template?: ScenarioTemplate): CharacterRole[] {
  if (!template || !Array.isArray(template.characterRoles)) {
    return [{ role: 'main', label: 'Главный герой', required: true }];
  }
  return template.characterRoles
    .filter((item): item is CharacterRole => {
      if (!item || typeof item !== 'object') return false;
      const role = item as Record<string, unknown>;
      return typeof role.role === 'string' && typeof role.label === 'string' && typeof role.required === 'boolean';
    })
    .map((role) => ({ role: role.role, label: role.label, required: role.required }));
}

function fileSummary(file: File | null) {
  if (!file) return null;
  return `${file.name} (${Math.round(file.size / 1024)} KB)`;
}

export function AdminScenarioTemplateForm({ mode, template }: AdminScenarioTemplateFormProps) {
  const router = useRouter();
  const [createTemplate, createState] = useCreateAdminScenarioTemplateMutation();
  const [updateTemplate, updateState] = useUpdateAdminScenarioTemplateMutation();
  const [deleteTemplate, deleteState] = useDeleteAdminScenarioTemplateMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [slug, setSlug] = useState(template?.slug ?? '');
  const [title, setTitle] = useState(template?.title ?? '');
  const [shortDesc, setShortDesc] = useState(template?.shortDesc ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [category, setCategory] = useState(template?.category ?? 'birthday');
  const [promptTemplate, setPromptTemplate] = useState(template?.promptTemplate ?? '');
  const [roles, setRoles] = useState<CharacterRole[]>(rolesFromTemplate(template));
  const [needsScene, setNeedsScene] = useState(template?.needsScene ?? false);
  const [recommendedDuration, setRecommendedDuration] = useState(String(template?.recommendedDuration ?? 10));
  const [defaultStyle, setDefaultStyle] = useState(template?.defaultStyle ?? 'cinematic');
  const [aiProvider, setAiProvider] = useState(template?.aiProvider ?? 'fal');
  const [aiModel, setAiModel] = useState(template?.aiModel ?? 'fal-veo-mock');
  const [aiConfig, setAiConfig] = useState(prettyJson(template?.aiConfig));
  const [priceTokens, setPriceTokens] = useState(String(template?.priceTokens ?? 100));
  const [tags, setTags] = useState(template?.tags.join(', ') ?? '');
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(template?.isFeatured ?? false);
  const [previewVideo, setPreviewVideo] = useState<File | null>(null);
  const [previewImage, setPreviewImage] = useState<File | null>(null);

  const isCreate = mode === 'create';
  const isBusy = createState.isLoading || updateState.isLoading;
  const previewImageUrl = useMemo(() => (previewImage ? URL.createObjectURL(previewImage) : null), [previewImage]);

  const updateRole = (index: number, patch: Partial<CharacterRole>) => {
    setRoles((current) => current.map((role, i) => (i === index ? { ...role, ...patch } : role)));
  };

  const removeRole = (index: number) => {
    setRoles((current) => current.filter((_, i) => i !== index));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      JSON.parse(aiConfig || '{}');
    } catch {
      toast({ title: 'aiConfig должен быть JSON-объектом', variant: 'destructive' });
      return;
    }

    if (roles.some((role) => !role.role.trim() || !role.label.trim())) {
      toast({ title: 'Заполните role и label для каждой роли', variant: 'destructive' });
      return;
    }
    if (isCreate && (!previewVideo || !previewImage)) {
      toast({ title: 'Добавьте preview video и preview image', variant: 'destructive' });
      return;
    }

    const form = new FormData();
    form.append('slug', slug.trim());
    form.append('title', title.trim());
    form.append('shortDesc', shortDesc.trim());
    form.append('description', description.trim());
    form.append('category', category);
    form.append('promptTemplate', promptTemplate.trim());
    form.append('characterRoles', JSON.stringify(roles.map((role) => ({
      role: role.role.trim(),
      label: role.label.trim(),
      required: role.required,
    }))));
    form.append('needsScene', String(needsScene));
    form.append('recommendedDuration', recommendedDuration.trim() || '10');
    form.append('defaultStyle', defaultStyle.trim() || 'cinematic');
    form.append('aiProvider', aiProvider.trim() || 'fal');
    form.append('aiModel', aiModel.trim());
    form.append('aiConfig', aiConfig || '{}');
    form.append('priceTokens', priceTokens.trim());
    form.append('tags', tags);
    form.append('isActive', String(isActive));
    form.append('isFeatured', String(isFeatured));
    if (previewVideo) form.append('previewVideo', previewVideo);
    if (previewImage) form.append('previewImage', previewImage);

    try {
      if (isCreate) {
        await createTemplate(form).unwrap();
      } else if (template) {
        await updateTemplate({ id: template.id, body: form }).unwrap();
      }
      router.push('/admin/scenario-templates');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!template) return;
    try {
      await deleteTemplate(template.id).unwrap();
      setDeleteOpen(false);
      router.push('/admin/scenario-templates');
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="slug">Слаг</Label>
                <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Категория</Label>
                <select
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
                >
                  {templateCategories.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Название</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="shortDesc">Короткое описание</Label>
              <Input id="shortDesc" value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="promptTemplate">Шаблон промпта</Label>
              <Textarea
                id="promptTemplate"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={8}
                className="font-mono"
                required
              />
            </div>

            <div className="space-y-3 rounded-md border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-center justify-between gap-3">
                <Label>Роли персонажей</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setRoles((current) => [...current, { role: 'secondary', label: 'Второй герой', required: false }])}
                >
                  <Plus className="h-4 w-4" />
                  Добавить роль
                </Button>
              </div>
              <div className="space-y-3">
                {roles.map((role, index) => (
                  <div key={index} className="grid gap-3 rounded-md border border-zinc-800 bg-zinc-900 p-3 md:grid-cols-[1fr_1fr_auto_auto]">
                    <Input value={role.role} onChange={(e) => updateRole(index, { role: e.target.value })} placeholder="роль" required />
                    <Input value={role.label} onChange={(e) => updateRole(index, { label: e.target.value })} placeholder="подпись" required />
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={role.required} onChange={(e) => updateRole(index, { required: e.target.checked })} />
                      обязательная
                    </label>
                    <Button type="button" variant="destructive" size="icon" onClick={() => removeRole(index)} disabled={roles.length === 1}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="recommendedDuration">Длительность</Label>
                <Input id="recommendedDuration" type="number" min={1} value={recommendedDuration} onChange={(e) => setRecommendedDuration(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="defaultStyle">Стиль</Label>
                <Input id="defaultStyle" value={defaultStyle} onChange={(e) => setDefaultStyle(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceTokens">Цена, токены</Label>
                <Input id="priceTokens" type="number" min={1} value={priceTokens} onChange={(e) => setPriceTokens(e.target.value)} required />
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="aiProvider">AI-провайдер</Label>
                <Input id="aiProvider" value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="aiModel">AI-модель</Label>
                <Input id="aiModel" value={aiModel} onChange={(e) => setAiModel(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="aiConfig">AI-конфиг</Label>
              <Textarea id="aiConfig" value={aiConfig} onChange={(e) => setAiConfig(e.target.value)} rows={6} className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Теги</Label>
              <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="birthday, family, portrait" />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
                <input type="checkbox" checked={needsScene} onChange={(e) => setNeedsScene(e.target.checked)} />
                Нужна сцена
              </label>
              <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Активен
              </label>
              <label className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm">
                <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                Рекомендуемый
              </label>
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="previewVideo">Превью-видео</Label>
              <Input
                id="previewVideo"
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                required={isCreate}
                onChange={(e) => setPreviewVideo(e.target.files?.[0] ?? null)}
              />
              {fileSummary(previewVideo) && <p className="text-xs text-slate-400">{fileSummary(previewVideo)}</p>}
              {!isCreate && template?.previewVideo && (
                <Link href={template.previewVideo} target="_blank" className="block text-sm text-violet-300 hover:text-violet-200">
                  Текущее видео
                </Link>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="previewImage">Превью-изображение</Label>
              <Input
                id="previewImage"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={isCreate}
                onChange={(e) => setPreviewImage(e.target.files?.[0] ?? null)}
              />
              {previewImageUrl && <img src={previewImageUrl} alt="" className="h-44 w-full rounded-md object-cover" />}
              {!previewImageUrl && template?.previewImage && <img src={template.previewImage} alt="" className="h-44 w-full rounded-md object-cover" />}
              {!isCreate && <p className="text-xs text-slate-500">Новый файл заменит текущий ассет</p>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-5">
          <div>
            {!isCreate && template && (
              <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Удалить
              </Button>
            )}
          </div>
          <div className="flex gap-3">
            <Button asChild type="button" variant="outline">
              <Link href="/admin/scenario-templates">Отмена</Link>
            </Button>
            <Button type="submit" disabled={isBusy} className="bg-violet-600 hover:bg-violet-500">
              {isCreate ? 'Создать шаблон' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Удалить шаблон?"
        description="Шаблон будет удалён без восстановления. Если есть активные эпизоды, сервер не даст его удалить."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
