'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCreateAdminServiceCategoryMutation,
  useDeleteAdminServiceCategoryMutation,
  useListAdminServiceCategoriesQuery,
  useReorderAdminServiceCategoriesMutation,
  useUpdateAdminServiceCategoryMutation,
  type AdminServiceCategory,
} from '@/store/api/admin-service-categories-api';

type FormDraft = {
  code: string;
  title: string;
  description: string;
  shortDescription: string;
  iconName: string;
  isActive: boolean;
  isFeatured: boolean;
};

const ICON_OPTIONS = ['Sparkles', 'Heart', 'Clapperboard', 'Baby', 'Gift', 'Flame', 'Cake', 'LayoutGrid'];

function emptyDraft(): FormDraft {
  return {
    code: '',
    title: '',
    description: '',
    shortDescription: '',
    iconName: 'Sparkles',
    isActive: true,
    isFeatured: false,
  };
}

function draftFrom(category: AdminServiceCategory): FormDraft {
  return {
    code: category.code,
    title: category.title,
    description: category.description ?? '',
    shortDescription: category.shortDescription ?? '',
    iconName: category.iconName ?? 'Sparkles',
    isActive: category.isActive,
    isFeatured: category.isFeatured,
  };
}

function apiErrorMessage(error: unknown) {
  const data = (error as { data?: { error?: { code?: string; message?: string } } }).data?.error;
  if (data?.code === 'CATEGORY_CODE_TAKEN') return 'Код категории уже занят';
  if (data?.code === 'CATEGORY_IN_USE') return data.message ?? 'Категория используется услугами';
  if (data?.code === 'CATEGORY_NOT_FOUND') return 'Категория не найдена';
  return data?.message ?? 'Операция не выполнена';
}

export default function AdminCategoriesPage() {
  const { data, isLoading } = useListAdminServiceCategoriesQuery();
  const [createCategory, createState] = useCreateAdminServiceCategoryMutation();
  const [updateCategory, updateState] = useUpdateAdminServiceCategoryMutation();
  const [deleteCategory, deleteState] = useDeleteAdminServiceCategoryMutation();
  const [reorderCategories] = useReorderAdminServiceCategoriesMutation();

  const items = useMemo(() => data?.items ?? [], [data?.items]);

  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<FormDraft>(emptyDraft);

  const openCreate = () => {
    setMode('create');
    setEditingCode(null);
    setDraft(emptyDraft());
  };

  const openEdit = (category: AdminServiceCategory) => {
    setMode('edit');
    setEditingCode(category.code);
    setDraft(draftFrom(category));
  };

  const closeForm = () => {
    setMode(null);
    setEditingCode(null);
  };

  const save = async () => {
    try {
      if (mode === 'create') {
        await createCategory({
          code: draft.code.trim().toUpperCase(),
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          shortDescription: draft.shortDescription.trim() || null,
          iconName: draft.iconName.trim() || null,
          isActive: draft.isActive,
          isFeatured: draft.isFeatured,
        }).unwrap();
        toast({ title: 'Категория создана' });
      } else if (mode === 'edit' && editingCode) {
        await updateCategory({
          code: editingCode,
          data: {
            title: draft.title.trim(),
            description: draft.description.trim() || null,
            shortDescription: draft.shortDescription.trim() || null,
            iconName: draft.iconName.trim() || null,
            isActive: draft.isActive,
            isFeatured: draft.isFeatured,
          },
        }).unwrap();
        toast({ title: 'Категория обновлена' });
      }
      closeForm();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const remove = async (category: AdminServiceCategory) => {
    if (!window.confirm(`Удалить категорию «${category.title}»?`)) return;
    try {
      await deleteCategory(category.code).unwrap();
      toast({ title: 'Категория удалена' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const move = async (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    try {
      await reorderCategories(next.map((item) => item.code)).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const toggleActive = async (category: AdminServiceCategory) => {
    try {
      await updateCategory({ code: category.code, data: { isActive: !category.isActive } }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const toggleFeatured = async (category: AdminServiceCategory) => {
    try {
      await updateCategory({ code: category.code, data: { isFeatured: !category.isFeatured } }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const busy = createState.isLoading || updateState.isLoading || deleteState.isLoading;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Категории услуг</h1>
          <p className="mt-2 text-sm text-slate-400">Создавайте, редактируйте, скрывайте и переупорядочивайте категории, по которым группируются услуги на витрине.</p>
        </div>
        <Button onClick={openCreate} className="bg-rose-500 hover:bg-rose-400">
          <Plus className="h-4 w-4" />
          Создать категорию
        </Button>
      </div>

      {mode && (
        <div className="mt-6 rounded-lg border border-rose-500/30 bg-zinc-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">
              {mode === 'create' ? 'Новая категория' : `Редактирование: ${editingCode}`}
            </h2>
            <Button variant="ghost" size="sm" onClick={closeForm}>Отмена</Button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category-code">Код (UPPER_SNAKE_CASE)</Label>
              <Input
                id="category-code"
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })}
                disabled={mode === 'edit'}
                placeholder="HOLIDAYS"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-title">Название</Label>
              <Input
                id="category-title"
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Праздники"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="category-short">Короткое описание (для карточки категории)</Label>
              <Input
                id="category-short"
                value={draft.shortDescription}
                onChange={(event) => setDraft({ ...draft, shortDescription: event.target.value })}
                placeholder="Видео-открытки и сюрпризы для дат"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="category-desc">Описание</Label>
              <Textarea
                id="category-desc"
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                rows={3}
                placeholder="Развёрнутое описание категории на странице каталога"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-icon">Иконка</Label>
              <select
                id="category-icon"
                value={draft.iconName}
                onChange={(event) => setDraft({ ...draft, iconName: event.target.value })}
                className="h-10 w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
              >
                {ICON_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-4 pt-6">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
                Активна
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.isFeatured} onChange={(event) => setDraft({ ...draft, isFeatured: event.target.checked })} />
                Рекомендуемая
              </label>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={closeForm}>Отмена</Button>
            <Button onClick={save} disabled={busy || !draft.code || !draft.title} className="bg-rose-500 hover:bg-rose-400">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'create' ? 'Создать' : 'Сохранить'}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Код / Название</th>
              <th className="px-4 py-3">Описание</th>
              <th className="px-4 py-3">Услуг</th>
              <th className="px-4 py-3">Реком.</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Порядок</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Загрузка...</td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">Пока нет категорий. Создайте первую — она появится в каталоге.</td>
              </tr>
            )}
            {items.map((category, index) => (
              <tr key={category.code} className="border-t border-zinc-800">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{category.title}</div>
                  <div className="text-xs text-slate-500">{category.code}</div>
                </td>
                <td className="px-4 py-3 max-w-md text-slate-300">{category.shortDescription ?? category.description ?? '—'}</td>
                <td className="px-4 py-3 text-slate-300">{category.servicesCount}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleFeatured(category)} className="text-xs">
                    <Badge className={category.isFeatured ? 'bg-amber-500/15 text-amber-200' : 'bg-zinc-800 text-slate-400'}>
                      {category.isFeatured ? 'Да' : 'Нет'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleActive(category)}>
                    <Badge className={category.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>
                      {category.isActive ? 'Активна' : 'Скрыта'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-300">{category.sortOrder}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="icon" onClick={() => move(index, 'up')} disabled={index === 0} aria-label="Вверх">
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => move(index, 'down')} disabled={index === items.length - 1} aria-label="Вниз">
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => openEdit(category)} aria-label="Редактировать">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => remove(category)}
                      disabled={category.servicesCount > 0}
                      aria-label="Удалить"
                      className="text-red-300 hover:border-red-500 hover:text-red-200 disabled:text-slate-600"
                      title={category.servicesCount > 0 ? `В категории ${category.servicesCount} услуг — удалить нельзя` : ''}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
