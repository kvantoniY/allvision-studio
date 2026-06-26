'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatMoney, serviceMargin, summarizePipelinePricing, type ServiceMargin } from '@allvision/shared';
import {
  buildMockUserInputs,
  PipelineTestPanel,
} from '@/components/admin/services/AdminServiceForm';
import {
  type AdminService,
  type ServiceCategory,
  useDeleteAdminServiceMutation,
  useDuplicateAdminServiceMutation,
  useGetAdminBlocksQuery,
  useListAdminServicesQuery,
  useReorderAdminServiceMutation,
  useTestRunAdminServiceMutation,
  useUpdateAdminServiceMutation,
} from '@/store/api/admin-services-api';
import { useGetAdminSettingsQuery } from '@/store/api/admin-settings-api';
import { useListAdminServiceCategoriesQuery } from '@/store/api/admin-service-categories-api';

type StatusFilter = 'all' | 'active' | 'hidden';
type FeaturedFilter = 'all' | 'featured';

// Categories are loaded dynamically from API.

type ApiError = {
  data?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

function apiErrorMessage(error: unknown) {
  const code = (error as ApiError)?.data?.error?.code;
  if (code === 'SERVICE_IN_USE') return 'Услуга используется активным проектом';
  if (code === 'PIPELINE_CONFIG_MISSING') return 'У услуги нет pipelineConfig';
  return (error as ApiError)?.data?.error?.message ?? 'Операция не выполнена';
}

const MOCK_PREVIEW = '/mock_preview.png';

function previewMedia(service: AdminService): { type: 'image' | 'video'; url: string } | null {
  const image = service.previewImage ?? service.coverImage;
  const video = service.previewVideo;
  if (service.previewMode === 'image' && image) return { type: 'image', url: image };
  if (service.previewMode === 'video' && video) return { type: 'video', url: video };
  if (video) return { type: 'video', url: video };
  if (image) return { type: 'image', url: image };
  return null;
}

function patchData(value: Record<string, unknown>) {
  const body = new FormData();
  body.append('data', JSON.stringify(value));
  return body;
}

function marginRowClass(marginPercent: number | null) {
  if (marginPercent === null) return '';
  if (marginPercent < 0) return 'bg-red-950/10';
  if (marginPercent < 50) return 'bg-amber-950/10';
  return 'bg-emerald-950/5';
}

function formatMargin(value: number | null) {
  return value === null ? 'н/д' : `${value.toFixed(0)}%`;
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatRub(value: number) {
  return `~${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function marginBadgeClass(marginPercent: number | null) {
  if (marginPercent === null) return 'bg-zinc-800 text-slate-300';
  if (marginPercent < 0) return 'bg-red-500/15 text-red-200 ring-1 ring-red-500/30';
  if (marginPercent < 50) return 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/30';
}

// Компактная вертикальная сводка: цена / себестоимость / маржа в три строки.
function PricingCell({ margin, usdToRub }: { margin: ServiceMargin; usdToRub: number }) {
  return (
    <div className="w-[152px] space-y-1 text-xs">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-500">Цена</span>
        <span className="font-semibold text-slate-100">
          {margin.priceCoins} <span className="font-normal text-slate-500">ток · {formatMoney({ coins: margin.priceCoins }, { primary: 'rub' })}</span>
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-slate-500">Себест.</span>
        <span className="text-slate-300">
          {formatUsd(margin.costUsd)} <span className="text-slate-500">· {formatRub(margin.costUsd * usdToRub)}</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-500">Маржа</span>
        <span
          className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', marginBadgeClass(margin.marginPercent))}
          title={`Прибыль ${formatUsd(margin.profitUsd)} · ${formatMoney({ coins: margin.profitCoins }, { primary: 'rub' })}`}
        >
          {formatMargin(margin.marginPercent)}
        </span>
      </div>
    </div>
  );
}

export default function AdminServicesPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [featured, setFeatured] = useState<FeaturedFilter>('all');
  const [category, setCategory] = useState<ServiceCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminService | null>(null);
  const [testGenerationId, setTestGenerationId] = useState<string | null>(null);
  const { data: blocksData } = useGetAdminBlocksQuery();
  const settings = useGetAdminSettingsQuery();
  const categoriesQuery = useListAdminServiceCategoriesQuery();
  const availableCategories = categoriesQuery.data?.items ?? [];
  const categoryTitleByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of availableCategories) map.set(item.code, item.title);
    return map;
  }, [availableCategories]);
  const usdToRub = settings.data?.settings.usdToRub ?? 80;
  const { data, isLoading } = useListAdminServicesQuery({
    page: 1,
    limit: 200,
    category: category === 'all' ? undefined : category,
    isActive: status === 'all' ? undefined : status === 'active',
    isFeatured: featured === 'featured' ? true : undefined,
    search: search.trim() || undefined,
  });
  const [updateService] = useUpdateAdminServiceMutation();
  const [deleteService, deleteState] = useDeleteAdminServiceMutation();
  const [reorderService] = useReorderAdminServiceMutation();
  const [duplicateService] = useDuplicateAdminServiceMutation();
  const [testRun] = useTestRunAdminServiceMutation();

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const blocks = blocksData?.blocks;

  const toggleActive = async (service: AdminService) => {
    try {
      await updateService({ id: service.id, body: patchData({ isActive: !service.isActive }) }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const toggleFeatured = async (service: AdminService) => {
    try {
      await updateService({ id: service.id, body: patchData({ isFeatured: !service.isFeatured }) }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const reorder = async (service: AdminService, direction: 'up' | 'down') => {
    try {
      await reorderService({ id: service.id, direction }).unwrap();
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const duplicate = async (service: AdminService) => {
    try {
      await duplicateService(service.id).unwrap();
      toast({ title: 'Копия создана' });
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const runTest = async (service: AdminService) => {
    try {
      const result = await testRun({
        id: service.id,
        userInputs: buildMockUserInputs(service.userInputForm),
        selectedTier: 'standard',
      }).unwrap();
      setTestGenerationId(result.generationId);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteService(deleteTarget.id).unwrap();
      setDeleteTarget(null);
    } catch (error) {
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="animate-admin-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Услуги</h1>
          <p className="mt-1.5 text-sm text-slate-400">Готовые решения — настраиваемые пайплайны для витрины AI-подарков.</p>
        </div>
        <Button asChild className="bg-violet-600 shadow-sm shadow-violet-900/40 transition-colors hover:bg-violet-500">
          <Link href="/admin/services/new">
            <Plus className="h-4 w-4" />
            Создать услугу
          </Link>
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value as ServiceCategory | 'all')}
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100 transition-colors hover:border-zinc-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="all">Все категории</option>
          {availableCategories.map((item) => (
            <option key={item.code} value={item.code}>
              {item.title}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100 transition-colors hover:border-zinc-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="hidden">Скрытые</option>
        </select>
        <select
          value={featured}
          onChange={(event) => setFeatured(event.target.value as FeaturedFilter)}
          className="h-10 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100 transition-colors hover:border-zinc-700 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        >
          <option value="all">Все</option>
          <option value="featured">Рекомендуемые</option>
        </select>
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по названию" className="pl-9" />
        </div>
      </div>

      {testGenerationId && (
        <div className="mt-6">
          <PipelineTestPanel generationId={testGenerationId} onClose={() => setTestGenerationId(null)} />
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800/80 shadow-sm">
        <table className="min-w-[860px] w-full divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900/80 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 backdrop-blur">
            <tr>
              <th className="w-[56px] px-3 py-2.5">Превью</th>
              <th className="px-3 py-2.5">Название</th>
              <th className="w-[120px] px-3 py-2.5">Категория</th>
              <th className="w-[168px] px-3 py-2.5">Экономика</th>
              <th className="w-[88px] px-2 py-2.5 text-center">Статус</th>
              <th className="w-[84px] px-2 py-2.5 text-center" title="Порядок в каталоге — стрелками меняйте позицию">Порядок</th>
              <th className="w-[176px] px-3 py-2.5 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center">
                  <div className="font-medium text-white">Создайте первую услугу — она появится в каталоге</div>
                  <Button asChild className="mt-4 bg-violet-600 hover:bg-violet-500">
                    <Link href="/admin/services/new">Создать услугу</Link>
                  </Button>
                </td>
              </tr>
            )}
            {items.map((service) => {
              const pricing = summarizePipelinePricing(service.pipelineConfig, blocks, usdToRub);
              const effectivePrice = service.priceCoinsPro ?? service.priceCoinsStandard ?? service.priceTokens;
              const margin = serviceMargin(effectivePrice, pricing.pro.costUsd, usdToRub);
              const media = previewMedia(service);
              return (
              <tr key={service.id} className={cn('align-middle transition-colors hover:bg-zinc-900/70', marginRowClass(margin.marginPercent))}>
                <td className="px-3 py-2.5">
                  {media?.type === 'video' ? (
                    <video src={media.url} muted preload="metadata" className="h-11 w-11 rounded-lg bg-black object-cover ring-1 ring-inset ring-white/10" />
                  ) : (
                    <img
                      src={media?.url ?? MOCK_PREVIEW}
                      alt=""
                      className="h-11 w-11 rounded-lg object-cover ring-1 ring-inset ring-white/10"
                      onError={(event) => {
                        if (event.currentTarget.src !== window.location.origin + MOCK_PREVIEW) {
                          event.currentTarget.src = MOCK_PREVIEW;
                        }
                      }}
                    />
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/admin/services/${service.id}`} className="block max-w-[280px] truncate font-medium text-white transition-colors hover:text-violet-300">
                    {service.title}
                  </Link>
                  <div className="max-w-[280px] truncate font-mono text-xs text-slate-500">{service.slug}</div>
                </td>
                <td className="px-3 py-2.5">
                  <Badge className="bg-zinc-800 font-medium text-slate-300">{categoryTitleByCode.get(service.category) ?? service.category}</Badge>
                </td>
                <td className="px-3 py-2.5">
                  <PricingCell margin={margin} usdToRub={usdToRub} />
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleActive(service)}
                      title={service.isActive ? 'Опубликована — нажмите, чтобы скрыть' : 'Скрыта — нажмите, чтобы опубликовать'}
                      className="transition-transform hover:scale-105"
                    >
                      <Badge className={service.isActive ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-500/30' : 'bg-zinc-700/60 text-slate-300'}>
                        {service.isActive ? 'Активна' : 'Скрыта'}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFeatured(service)}
                      title={service.isFeatured ? 'В подборке «Рекомендуемые» — нажмите, чтобы убрать' : 'Добавить в подборку «Рекомендуемые»'}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-amber-300"
                    >
                      <Star className={service.isFeatured ? 'h-3.5 w-3.5 fill-amber-400 text-amber-400' : 'h-3.5 w-3.5'} />
                      {service.isFeatured ? 'в подборке' : 'обычная'}
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="tabular-nums text-sm font-semibold text-slate-300">{service.sortOrder}</span>
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() => reorder(service, 'up')}
                        title="Поднять выше в каталоге"
                        className="rounded border border-zinc-700/80 bg-zinc-900 p-0.5 text-slate-400 transition-colors hover:border-violet-500/50 hover:text-violet-300"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => reorder(service, 'down')}
                        title="Опустить ниже в каталоге"
                        className="rounded border border-zinc-700/80 bg-zinc-900 p-0.5 text-slate-400 transition-colors hover:border-violet-500/50 hover:text-violet-300"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 transition-colors hover:border-violet-500/50 hover:text-violet-300" onClick={() => runTest(service)} title="Тестовый прогон pipeline" aria-label="Тестовый прогон">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="outline" size="icon" className="h-8 w-8 transition-colors hover:border-violet-500/50 hover:text-violet-300" title="Редактировать услугу" aria-label="Редактировать">
                      <Link href={`/admin/services/${service.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="h-8 w-8 transition-colors hover:border-violet-500/50 hover:text-violet-300" onClick={() => duplicate(service)} title="Создать копию услуги" aria-label="Дублировать">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(service)} title="Удалить услугу" aria-label="Удалить">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Удалить услугу?"
        description="Услуга будет удалена без восстановления. Активные проекты заблокируют удаление."
        busy={deleteState.isLoading}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
