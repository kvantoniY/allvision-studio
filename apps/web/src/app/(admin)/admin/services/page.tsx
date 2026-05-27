'use client';

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Edit,
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
import { serviceMargin, summarizePipelinePricing, type ServiceMargin } from '@allvision/shared';
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

function previewUrl(service: AdminService) {
  return service.previewImage ?? service.coverImage;
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

function PricingMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-900/70 px-2.5 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

function PricingTierCard({
  label,
  margin,
  usdToRub,
}: {
  label: string;
  margin: ServiceMargin;
  usdToRub: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/80 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', marginBadgeClass(margin.marginPercent))}>
          {formatMargin(margin.marginPercent)}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <PricingMetric label="Себест." value={formatUsd(margin.costUsd)} sub={formatRub(margin.costUsd * usdToRub)} />
        <PricingMetric label="Цена" value={`${margin.priceCoins} ток.`} sub={`~${margin.priceCoins.toLocaleString('ru-RU')} ₽`} />
        <PricingMetric label="Прибыль" value={formatUsd(margin.profitUsd)} sub={formatRub(margin.profitCoins)} />
      </div>
    </div>
  );
}

function PricingSummaryCell({
  standardMargin,
  proMargin,
  usdToRub,
}: {
  standardMargin: ServiceMargin;
  proMargin: ServiceMargin | null;
  usdToRub: number;
}) {
  return (
    <div className="w-[320px] space-y-2">
      <PricingTierCard label="Стандарт" margin={standardMargin} usdToRub={usdToRub} />
      {proMargin ? (
        <PricingTierCard label="Pro" margin={proMargin} usdToRub={usdToRub} />
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-xs text-slate-500">
          Pro-цена не задана
        </div>
      )}
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
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Услуги (готовые решения)</h1>
          <p className="mt-2 text-sm text-slate-400">Настраиваемые пайплайны для витрины AI-подарков.</p>
        </div>
        <Button asChild className="bg-rose-500 hover:bg-rose-400">
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
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
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
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
        >
          <option value="all">Все статусы</option>
          <option value="active">Активные</option>
          <option value="hidden">Скрытые</option>
        </select>
        <select
          value={featured}
          onChange={(event) => setFeatured(event.target.value as FeaturedFilter)}
          className="h-10 rounded-md border border-zinc-800 bg-zinc-900 px-3 text-sm text-slate-100"
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

      <div className="mt-6 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-[1280px] divide-y divide-zinc-800 text-sm">
          <thead className="bg-zinc-900 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="w-[92px] px-4 py-3">Превью</th>
              <th className="w-[280px] px-4 py-3">Название</th>
              <th className="w-[150px] px-4 py-3">Категория</th>
              <th className="w-[360px] px-4 py-3">Экономика</th>
              <th className="w-[120px] px-4 py-3">Реком.</th>
              <th className="w-[120px] px-4 py-3">Статус</th>
              <th className="w-[90px] px-4 py-3">Порядок</th>
              <th className="w-[300px] px-4 py-3 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800 bg-zinc-950">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-14 text-center">
                  <div className="font-medium text-white">Создайте первую услугу — она появится в каталоге</div>
                  <Button asChild className="mt-4 bg-rose-500 hover:bg-rose-400">
                    <Link href="/admin/services/new">Создать услугу</Link>
                  </Button>
                </td>
              </tr>
            )}
            {items.map((service) => {
              const pricing = summarizePipelinePricing(service.pipelineConfig, blocks, usdToRub);
              const standardMargin = serviceMargin(
                service.priceCoinsStandard ?? service.priceTokens,
                pricing.standard.costUsd,
                usdToRub,
              );
              const proMargin = service.priceCoinsPro
                ? serviceMargin(service.priceCoinsPro, pricing.pro.costUsd, usdToRub)
                : null;
              const marginValues = [standardMargin.marginPercent, proMargin?.marginPercent]
                .filter((value): value is number => value !== null && value !== undefined);
              const minMargin = marginValues.length ? Math.min(...marginValues) : null;
              return (
              <tr key={service.id} className={cn('align-middle transition-colors hover:bg-zinc-900/70', marginRowClass(minMargin))}>
                <td className="px-4 py-3">
                  {previewUrl(service) ? (
                    <img src={previewUrl(service)!} alt="" className="h-[60px] w-[60px] rounded-md object-cover" />
                  ) : (
                    <div className="h-[60px] w-[60px] rounded-md bg-zinc-800" />
                  )}
                </td>
                <td className="max-w-[260px] px-4 py-3">
                  <div className="truncate font-medium text-white">{service.title}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{service.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge className="bg-zinc-800 text-slate-200">{categoryTitleByCode.get(service.category) ?? service.category}</Badge>
                </td>
                <td className="px-4 py-3">
                  <PricingSummaryCell standardMargin={standardMargin} proMargin={proMargin} usdToRub={usdToRub} />
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleFeatured(service)} aria-label="Рекомендуемая">
                    <Star className={service.isFeatured ? 'h-5 w-5 fill-amber-400 text-amber-400' : 'h-5 w-5 text-slate-600'} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleActive(service)}>
                    <Badge className={service.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>
                      {service.isActive ? 'Активна' : 'Скрыта'}
                    </Badge>
                  </button>
                </td>
                <td className="px-4 py-3">{service.sortOrder}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="icon" onClick={() => reorder(service, 'up')} aria-label="Вверх">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => reorder(service, 'down')} aria-label="Вниз">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => runTest(service)} aria-label="Тест">
                      <Play className="h-4 w-4" />
                    </Button>
                    <Button asChild variant="outline" size="icon" aria-label="Редактировать">
                      <Link href={`/admin/services/${service.id}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" size="icon" onClick={() => duplicate(service)} aria-label="Дублировать">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="destructive" size="icon" onClick={() => setDeleteTarget(service)} aria-label="Удалить">
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
    </>
  );
}
