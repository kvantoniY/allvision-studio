'use client';

import { useState } from 'react';
import {
  BRIEF_FIELD_TYPES,
  CUSTOM_ORDER_STATUSES,
  CUSTOM_ORDER_STATUS_LABELS,
  type BriefField,
  type BriefFieldType,
  type CustomOrderStatus,
} from '@allvision/shared';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useCreateAdminOrderTypeMutation,
  useDeleteAdminOrderTypeMutation,
  useListAdminOrderTypesQuery,
  useUpdateAdminOrderTypeMutation,
  type AdminOrderType,
} from '@/store/api/admin-orders-api';
import { cn } from '@/lib/utils';

const FIELD_TYPE_LABELS: Record<BriefFieldType, string> = {
  text: 'Строка',
  textarea: 'Текст',
  select: 'Выбор из списка',
  date: 'Дата',
  number: 'Число',
  photos: 'Фотографии',
};

type Draft = {
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  priceFromCoins: number;
  priceToCoins: number;
  leadTimeDays: number;
  isActive: boolean;
  sortOrder: number;
  briefFields: BriefField[];
  emailTemplates: Partial<Record<CustomOrderStatus, { subject: string; body: string }>>;
};

function emptyDraft(): Draft {
  return {
    slug: '',
    title: '',
    shortDesc: '',
    description: '',
    priceFromCoins: 1500,
    priceToCoins: 5000,
    leadTimeDays: 5,
    isActive: true,
    sortOrder: 0,
    briefFields: [
      { id: 'occasion', type: 'text', label: 'Повод', required: true },
      { id: 'details', type: 'textarea', label: 'Что должно быть в поздравлении', required: true },
    ],
    emailTemplates: {},
  };
}

function draftFrom(item: AdminOrderType): Draft {
  return {
    slug: item.slug,
    title: item.title,
    shortDesc: item.shortDesc,
    description: item.description,
    priceFromCoins: item.priceFromCoins,
    priceToCoins: item.priceToCoins,
    leadTimeDays: item.leadTimeDays,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    briefFields: item.briefFields,
    emailTemplates: item.emailTemplates ?? {},
  };
}

/**
 * Типы заказов. Всё, что определяет новый заказной формат — вопросы брифа, вилка цены
 * и письма — задаётся здесь. Добавление формата не требует релиза, и это главное:
 * заказные идеи придумываются быстрее, чем выкатываются версии.
 */
export default function AdminOrderTypesPage() {
  const { data, isLoading } = useListAdminOrderTypesQuery();
  const [createType, { isLoading: creating }] = useCreateAdminOrderTypeMutation();
  const [updateType, { isLoading: updating }] = useUpdateAdminOrderTypeMutation();
  const [deleteType] = useDeleteAdminOrderTypeMutation();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const items = data?.items ?? [];
  const busy = creating || updating;

  const startCreate = () => {
    setEditingId('new');
    setDraft(emptyDraft());
  };

  const startEdit = (item: AdminOrderType) => {
    setEditingId(item.id);
    setDraft(draftFrom(item));
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.slug.trim()) {
      toast({ title: 'Заполните название и слаг', variant: 'destructive' });
      return;
    }
    if (draft.briefFields.length === 0) {
      toast({ title: 'Добавьте хотя бы одно поле брифа', variant: 'destructive' });
      return;
    }
    const body = {
      ...draft,
      emailTemplates: Object.fromEntries(
        Object.entries(draft.emailTemplates).filter(([, value]) => value?.subject?.trim() && value?.body?.trim()),
      ) as Draft['emailTemplates'],
    };
    try {
      if (editingId === 'new') {
        await createType(body).unwrap();
      } else if (editingId) {
        const { slug: _slug, ...rest } = body;
        await updateType({ id: editingId, body: rest }).unwrap();
      }
      setEditingId(null);
      setDraft(null);
      toast({ title: 'Сохранено' });
    } catch (error) {
      const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
      toast({ title: 'Не удалось сохранить', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Типы заказов</h1>
          <p className="mt-1 text-sm text-slate-400">
            Из чего состоит заказное поздравление: вопросы брифа, вилка цены и письма по статусам.
          </p>
        </div>
        <Button type="button" onClick={startCreate}>
          <Plus className="h-4 w-4" />
          Новый тип
        </Button>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загружаем…
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-100">{item.title}</span>
                  {!item.isActive && <Badge variant="outline" className="text-[11px]">Скрыт</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {item.slug} · {item.priceFromCoins}–{item.priceToCoins} коинов · от {item.leadTimeDays} дн. ·
                  заявок: {item.ordersCount}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => startEdit(item)}>
                Изменить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!window.confirm(`Удалить тип «${item.title}»?`)) return;
                  try {
                    await deleteType(item.id).unwrap();
                  } catch (error) {
                    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
                    toast({ title: 'Не удалось удалить', description: message, variant: 'destructive' });
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-slate-500">
              Типов заказов пока нет.
            </p>
          )}
        </div>
      )}

      {draft && (
        <div className="space-y-5 rounded-xl border border-violet-500/30 bg-zinc-950 p-5">
          <h2 className="text-lg font-semibold text-slate-100">
            {editingId === 'new' ? 'Новый тип заказа' : 'Изменение типа'}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Слаг (в адресе)</Label>
              <Input
                value={draft.slug}
                disabled={editingId !== 'new'}
                onChange={(event) => setDraft({ ...draft, slug: event.target.value })}
                placeholder="custom-wedding"
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Название</Label>
              <Input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Короткое описание (на карточке)</Label>
            <Input
              value={draft.shortDesc}
              onChange={(event) => setDraft({ ...draft, shortDesc: event.target.value })}
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Полное описание</Label>
            <Textarea
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              rows={3}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Цена от</Label>
              <Input
                type="number"
                min={1}
                value={draft.priceFromCoins}
                onChange={(event) => setDraft({ ...draft, priceFromCoins: Number(event.target.value) })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Цена до</Label>
              <Input
                type="number"
                min={1}
                value={draft.priceToCoins}
                onChange={(event) => setDraft({ ...draft, priceToCoins: Number(event.target.value) })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Срок, дней</Label>
              <Input
                type="number"
                min={1}
                value={draft.leadTimeDays}
                onChange={(event) => setDraft({ ...draft, leadTimeDays: Number(event.target.value) })}
                className="h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Порядок</Label>
              <Input
                type="number"
                min={0}
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: Number(event.target.value) })}
                className="h-9"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
            />
            Показывать на витрине
          </label>

          <BriefFieldsEditor
            fields={draft.briefFields}
            onChange={(briefFields) => setDraft({ ...draft, briefFields })}
          />

          <EmailTemplatesEditor
            templates={draft.emailTemplates}
            onChange={(emailTemplates) => setDraft({ ...draft, emailTemplates })}
          />

          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Сохранить
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefFieldsEditor({
  fields,
  onChange,
}: {
  fields: BriefField[];
  onChange: (fields: BriefField[]) => void;
}) {
  const update = (index: number, patch: Partial<BriefField>) => {
    onChange(fields.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Поля брифа</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...fields,
              { id: `field_${fields.length + 1}`, type: 'text', label: 'Новый вопрос', required: false },
            ])
          }
        >
          <Plus className="h-4 w-4" />
          Вопрос
        </Button>
      </div>

      {fields.map((field, index) => (
        <div key={index} className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="grid gap-2 sm:grid-cols-[140px,1fr,160px]">
            <Input
              value={field.id}
              onChange={(event) => update(index, { id: event.target.value })}
              placeholder="id"
              className="h-8 font-mono text-xs"
            />
            <Input
              value={field.label}
              onChange={(event) => update(index, { label: event.target.value })}
              placeholder="Вопрос заказчику"
              className="h-8"
            />
            <select
              value={field.type}
              onChange={(event) => update(index, { type: event.target.value as BriefFieldType })}
              className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-slate-100"
            >
              {BRIEF_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FIELD_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <Input
            value={field.hint ?? ''}
            onChange={(event) => update(index, { hint: event.target.value || undefined })}
            placeholder="Подсказка под полем (необязательно)"
            className="h-8 text-xs"
          />
          {field.type === 'select' && (
            <Input
              value={(field.options ?? []).map((option) => option.label).join(', ')}
              onChange={(event) =>
                update(index, {
                  options: event.target.value
                    .split(',')
                    .map((part) => part.trim())
                    .filter(Boolean)
                    .map((label, optionIndex) => ({ value: `option_${optionIndex + 1}`, label })),
                })
              }
              placeholder="Варианты через запятую"
              className="h-8 text-xs"
            />
          )}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(event) => update(index, { required: event.target.checked })}
              />
              Обязательное
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(fields.filter((_, i) => i !== index))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}

function EmailTemplatesEditor({
  templates,
  onChange,
}: {
  templates: Partial<Record<CustomOrderStatus, { subject: string; body: string }>>;
  onChange: (templates: Partial<Record<CustomOrderStatus, { subject: string; body: string }>>) => void;
}) {
  const [openStatus, setOpenStatus] = useState<CustomOrderStatus | null>(null);

  return (
    <section className="space-y-2">
      <Label className="text-sm">Письма по статусам</Label>
      <p className="text-xs text-slate-500">
        Пусто — уйдёт наш стандартный текст. Подстановки: {'{{name}}'}, {'{{orderTitle}}'}, {'{{price}}'},{' '}
        {'{{link}}'}, {'{{note}}'}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CUSTOM_ORDER_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setOpenStatus(openStatus === status ? null : status)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition',
              openStatus === status
                ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                : templates[status]
                  ? 'border-emerald-500/40 text-emerald-200'
                  : 'border-zinc-700 text-slate-400 hover:border-zinc-600',
            )}
          >
            {CUSTOM_ORDER_STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {openStatus && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <Input
            value={templates[openStatus]?.subject ?? ''}
            onChange={(event) =>
              onChange({
                ...templates,
                [openStatus]: { subject: event.target.value, body: templates[openStatus]?.body ?? '' },
              })
            }
            placeholder="Тема письма"
            className="h-9"
          />
          <Textarea
            value={templates[openStatus]?.body ?? ''}
            onChange={(event) =>
              onChange({
                ...templates,
                [openStatus]: { subject: templates[openStatus]?.subject ?? '', body: event.target.value },
              })
            }
            rows={5}
            placeholder="Текст письма"
          />
        </div>
      )}
    </section>
  );
}
