'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Edit, Plus, Trash2 } from 'lucide-react';
import type { ScenarioTemplate } from '@allvision/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { TEMPLATE_CATEGORY_LABEL, templateCategories } from '@/components/studio/v3-labels';
import { toast } from '@/hooks/use-toast';
import {
  useDeleteAdminScenarioTemplateMutation,
  useListAdminScenarioTemplatesQuery,
  useReorderAdminScenarioTemplateMutation,
  useUpdateAdminScenarioTemplateMutation,
} from '@/store/api/admin-scenario-templates-api';

type StatusFilter = 'all' | 'active' | 'hidden';

function apiErrorMessage(error: unknown) {
  const code = (error as { data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'TEMPLATE_IN_USE') return 'Невозможно удалить: шаблон используется в активных эпизодах';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function AdminScenarioTemplatesPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ScenarioTemplate | null>(null);
  const { data, isLoading } = useListAdminScenarioTemplatesQuery({
    page: 1,
    limit: 200,
    category: category === 'all' ? undefined : category,
    isActive: status === 'all' ? undefined : status === 'active',
  });
  const [updateTemplate] = useUpdateAdminScenarioTemplateMutation();
  const [deleteTemplate, deleteState] = useDeleteAdminScenarioTemplateMutation();
  const [reorderTemplate] = useReorderAdminScenarioTemplateMutation();

  const items = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const source = data?.items ?? [];
    if (!needle) return source;
    return source.filter((template) => template.title.toLowerCase().includes(needle));
  }, [data?.items, search]);

  const patchBoolean = async (template: ScenarioTemplate, field: 'isActive' | 'isFeatured') => {
    const body = new FormData();
    body.append(field, String(!template[field]));
    try {
      await updateTemplate({ id: template.id, body }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const reorder = async (template: ScenarioTemplate, direction: 'up' | 'down') => {
    try {
      await reorderTemplate({ id: template.id, direction }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate(deleteTarget.id).unwrap();
      setDeleteTarget(null);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Шаблоны сценариев</h1>
          <p className="mt-2 text-sm text-slate-400">Каталог V3-сценариев для будущего workflow эпизодов.</p>
        </div>
        <Button asChild className="bg-violet-600 hover:bg-violet-500">
          <Link href="/admin/scenario-templates/new">
            <Plus className="h-4 w-4" />
            Создать шаблон
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все</option>
          <option value="active">Активные</option>
          <option value="hidden">Скрытые</option>
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все категории</option>
          {templateCategories.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию" className="max-w-sm" />
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Превью</th>
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Слаг</th>
              <th className="px-4 py-3">Категория</th>
              <th className="px-4 py-3">Цена</th>
              <th className="px-4 py-3">Активен</th>
              <th className="px-4 py-3">Рекомендуемый</th>
              <th className="px-4 py-3">Порядок</th>
              <th className="px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <div className="font-medium text-white">Шаблонов пока нет</div>
                  <Button asChild className="mt-4 bg-violet-600 hover:bg-violet-500">
                    <Link href="/admin/scenario-templates/new">Создать шаблон</Link>
                  </Button>
                </td>
              </tr>
            )}
            {items.map((template) => (
              <tr key={template.id} className="align-middle">
                <td className="px-4 py-3">
                  <img src={template.previewImage} alt="" className="h-10 w-10 rounded object-cover" />
                </td>
                <td className="max-w-[220px] px-4 py-3 font-medium text-white">
                  <div className="truncate">{template.title}</div>
                </td>
                <td className="px-4 py-3 text-slate-300">{template.slug}</td>
                <td className="px-4 py-3">{TEMPLATE_CATEGORY_LABEL[template.category] ?? template.category}</td>
                <td className="px-4 py-3">{template.priceTokens}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => patchBoolean(template, 'isActive')}>
                    <Badge className={template.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>
                      {template.isActive ? 'Да' : 'Нет'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => patchBoolean(template, 'isFeatured')}>
                    <Badge className={template.isFeatured ? 'bg-amber-500 text-slate-950' : 'bg-zinc-700'}>
                      {template.isFeatured ? 'Да' : 'Нет'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3">{template.sortOrder}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => reorder(template, 'up')} aria-label="Вверх">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => reorder(template, 'down')} aria-label="Вниз">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="outline" size="icon" aria-label="Редактировать">
                      <Link href={`/admin/scenario-templates/${template.id}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button type="button" variant="destructive" size="icon" onClick={() => setDeleteTarget(template)} aria-label="Удалить">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Удалить шаблон?"
        description="Шаблон будет удалён без восстановления. Активные эпизоды заблокируют удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </>
  );
}
