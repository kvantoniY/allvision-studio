'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, Plus, Search, Trash2, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  useGetEditorCatalogQuery,
  useListAllServicesForPickerQuery,
  useSaveEditorCatalogMutation,
  type EditorCatalogService,
  type EditorServiceCategory,
} from '@/store/api/editor-catalog-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function coverOf(service: { previewImage?: string | null; coverImage?: string | null }) {
  return mediaUrl(service.previewImage ?? service.coverImage) ?? null;
}

export function servicePriceCoins(service: EditorCatalogService) {
  return service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens ?? 0;
}

/**
 * Подборка услуг в панели ИИ.
 *
 * Полка автора ролика, а не витрина: категории и их состав собирает владелец прямо здесь,
 * через «+», и может положить сюда даже скрытую с сайта услугу. Никаких переходов наружу —
 * человек в середине сборки ролика не должен уходить со страницы.
 */
export function ServiceIdeaCards({
  onOpenService,
  runningSlug,
}: {
  onOpenService: (service: EditorCatalogService) => void;
  runningSlug?: string | null;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const { data, isLoading } = useGetEditorCatalogQuery();
  const [saveCatalog, saveState] = useSaveEditorCatalogMutation();

  const categories = useMemo(() => data?.categories ?? [], [data]);
  const services = useMemo(
    () => new Map((data?.services ?? []).map((service) => [service.slug, service])),
    [data],
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<EditorServiceCategory | null>(null);

  useEffect(() => {
    if (categories.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId((current) => (current && categories.some((item) => item.id === current) ? current : categories[0].id));
  }, [categories]);

  const active = categories.find((category) => category.id === activeId) ?? null;

  const persist = async (next: EditorServiceCategory[]) => {
    try {
      await saveCatalog({ categories: next }).unwrap();
    } catch {
      toast({ title: 'Не удалось сохранить подборку', variant: 'destructive' });
    }
  };

  const addCategory = () => {
    const title = window.prompt('Название категории');
    if (!title?.trim()) return;
    void persist([...categories, { id: '', title: title.trim(), serviceSlugs: [] }]);
  };

  const removeCategory = (id: string) => {
    if (!window.confirm('Удалить категорию из подборки?')) return;
    void persist(categories.filter((category) => category.id !== id));
  };

  const setSlugs = (id: string, slugs: string[]) =>
    persist(categories.map((category) => (category.id === id ? { ...category, serviceSlugs: slugs } : category)));

  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-lg border border-slate-800 bg-slate-900/60" />;
  }

  if (categories.length === 0 && !isAdmin) return null;

  return (
    <div className="space-y-2">
      {/* Категории лентой: их немного, но названия длинные — вертикальный список съел бы
          половину панели. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setActiveId(category.id)}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-xs transition',
              category.id === activeId
                ? 'border-violet-400 bg-violet-500/20 text-violet-100'
                : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200',
            )}
          >
            {category.title}
          </button>
        ))}
        {isAdmin && (
          <button
            type="button"
            onClick={addCategory}
            title="Добавить категорию"
            aria-label="Добавить категорию"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-dashed border-slate-600 text-slate-400 transition hover:border-amber-400 hover:text-amber-200"
          >
            {saveState.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>

      {active && (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {active.serviceSlugs.map((slug) => {
              const service = services.get(slug);
              if (!service) return null;
              const cover = coverOf(service);
              return (
                <div key={slug} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpenService(service)}
                    className="relative block aspect-square w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition hover:border-violet-400"
                  >
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                    ) : (
                      <span className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-900" />
                    )}
                    {runningSlug === slug && (
                      <span className="absolute inset-0 grid place-items-center bg-slate-950/70">
                        <Loader2 className="h-4 w-4 animate-spin text-violet-200" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-slate-950/85 px-1 py-0.5 text-[10px] leading-tight text-slate-200">
                      <span className="line-clamp-2">{service.title}</span>
                    </span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setSlugs(active.id, active.serviceSlugs.filter((item) => item !== slug))}
                      title="Убрать из категории"
                      aria-label="Убрать из категории"
                      className="absolute -right-1 -top-1 hidden h-5 w-5 place-items-center rounded-full border border-slate-700 bg-slate-950 text-slate-400 transition hover:text-rose-300 group-hover:grid"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}

            {isAdmin && (
              <button
                type="button"
                onClick={() => setPickerFor(active)}
                title="Добавить услугу в категорию"
                className="grid aspect-square place-items-center rounded-lg border border-dashed border-slate-600 text-slate-400 transition hover:border-amber-400 hover:text-amber-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => removeCategory(active.id)}
              className="text-[11px] text-slate-600 transition hover:text-rose-300"
            >
              Удалить категорию «{active.title}»
            </button>
          )}
        </>
      )}

      {pickerFor && (
        <ServicePickerModal
          category={pickerFor}
          onClose={() => setPickerFor(null)}
          onSave={(slugs) => {
            void setSlugs(pickerFor.id, slugs);
            setPickerFor(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Выбор услуг в категорию.
 *
 * Показываем ВСЕ услуги сайта, включая скрытые: подборка редактора — выбор владельца, а не
 * витрина, и спрятанная с сайта услуга здесь вполне уместна. Скрытые помечены, чтобы не
 * пришлось гадать.
 */
function ServicePickerModal({
  category,
  onClose,
  onSave,
}: {
  category: EditorServiceCategory;
  onClose: () => void;
  onSave: (slugs: string[]) => void;
}) {
  const { data, isLoading } = useListAllServicesForPickerQuery();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>(category.serviceSlugs);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const items = (data?.services ?? []).filter((service) => {
    const text = `${service.title} ${service.shortDesc} ${service.slug}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  const toggle = (slug: string) =>
    setSelected((current) => (current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:max-h-[80dvh] sm:max-w-lg sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Услуги в «{category.title}»</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-800 p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию"
              className="h-9 border-slate-700 bg-slate-950 pl-9"
            />
          </div>
        </div>

        <div className="studio-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {isLoading ? (
            <div className="text-sm text-slate-500">Загрузка…</div>
          ) : items.map((service) => {
            const checked = selected.includes(service.slug);
            const cover = coverOf(service);
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => toggle(service.slug)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition',
                  checked ? 'border-violet-500 bg-violet-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700',
                )}
              >
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-800 bg-slate-900">
                  {cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cover} alt="" className="h-full w-full object-cover" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm text-slate-100">{service.title}</span>
                    {!service.isActive && (
                      <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">скрыта</span>
                    )}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-[11px] text-slate-500">{service.shortDesc}</span>
                </span>
                {checked && <Check className="h-4 w-4 shrink-0 text-violet-300" />}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
          <span className="text-xs text-slate-500">Выбрано: {selected.length}</span>
          <Button type="button" size="sm" onClick={() => onSave(selected)}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}
