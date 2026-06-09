'use client';

import { useState, type FormEvent } from 'react';
import { Check, Coins, Plus, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  type AdminTokenPackage,
  type TokenPackageBody,
  useCreateAdminTokenPackageMutation,
  useDeleteAdminTokenPackageMutation,
  useListAdminTokenPackagesQuery,
  useUpdateAdminTokenPackageMutation,
} from '@/store/api/admin-token-packages-api';

const defaultFeatures = [
  'Токены зачисляются ровно по настройке пакета',
  'Списание только после запуска обработки',
  'Подходит для фото, анимаций и трендов',
];

type Draft = {
  title: string;
  subtitle: string;
  tokens: number;
  priceRub: number;
  originalPriceRub: string;
  bonus: number;
  badgeText: string;
  featuresText: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
};

const emptyDraft: Draft = {
  title: '',
  subtitle: '',
  tokens: 16,
  priceRub: 289,
  originalPriceRub: '349',
  bonus: 0,
  badgeText: '',
  featuresText: defaultFeatures.join('\n'),
  isPopular: false,
  isActive: true,
  sortOrder: 0,
};

function errorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

function draftFromPackage(item: AdminTokenPackage): Draft {
  return {
    title: item.title,
    subtitle: item.subtitle ?? '',
    tokens: item.tokens,
    priceRub: item.priceRub,
    originalPriceRub: item.originalPriceRub ? String(item.originalPriceRub) : '',
    bonus: item.bonus,
    badgeText: item.badgeText ?? '',
    featuresText: item.features.length ? item.features.join('\n') : defaultFeatures.join('\n'),
    isPopular: item.isPopular,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
  };
}

function bodyFromDraft(draft: Draft): TokenPackageBody {
  const originalPriceRub = Number(draft.originalPriceRub);
  return {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim() || null,
    tokens: Number(draft.tokens) || 0,
    priceRub: Number(draft.priceRub) || 0,
    originalPriceRub: draft.originalPriceRub.trim() && Number.isFinite(originalPriceRub) ? originalPriceRub : null,
    bonus: Number(draft.bonus) || 0,
    badgeText: draft.badgeText.trim() || null,
    features: draft.featuresText
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean),
    isPopular: draft.isPopular,
    isActive: draft.isActive,
    sortOrder: Number(draft.sortOrder) || 0,
  };
}

function totalTokens(draft: Draft) {
  return (Number(draft.tokens) || 0) + (Number(draft.bonus) || 0);
}

function discountPercent(draft: Draft) {
  const original = Number(draft.originalPriceRub);
  const current = Number(draft.priceRub);
  if (!Number.isFinite(original) || !Number.isFinite(current) || original <= current || current <= 0) return null;
  return Math.max(1, Math.round((1 - current / original) * 100));
}

export default function AdminTokenPackagesPage() {
  const { data, isFetching } = useListAdminTokenPackagesQuery();
  const [createPackage, createState] = useCreateAdminTokenPackageMutation();
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createPackage(bodyFromDraft(draft) as Required<Pick<TokenPackageBody, 'title' | 'tokens' | 'priceRub'>> & TokenPackageBody).unwrap();
      setDraft(emptyDraft);
      toast({ title: 'Пакет создан' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-rose-300">
          <Coins className="h-4 w-4" />
          Пакеты токенов
        </div>
        <h1 className="mt-2 text-3xl font-bold text-white">Пакеты пополнения</h1>
        <p className="mt-2 text-sm text-slate-400">Цены, бонусы, бейджи, скидки и пункты карточек на странице покупки токенов.</p>
      </div>

      <form onSubmit={submit} className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
        <PackageFields draft={draft} setDraft={setDraft} title="Новый пакет" />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={createState.isLoading} className="bg-rose-500 hover:bg-rose-400">
            <Plus className="h-4 w-4" />
            Создать пакет
          </Button>
          <PreviewBadge draft={draft} />
        </div>
      </form>

      <div className="grid gap-4">
        {(data?.items ?? []).map((item) => <PackageRow key={item.id} item={item} />)}
        {!isFetching && (data?.items.length ?? 0) === 0 && (
          <Card className="border-dashed border-zinc-800 bg-zinc-950">
            <CardContent className="p-8 text-center text-sm text-slate-500">Пакетов пока нет</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function PackageRow({ item }: { item: AdminTokenPackage }) {
  const [draft, setDraft] = useState<Draft>(() => draftFromPackage(item));
  const [updatePackage, updateState] = useUpdateAdminTokenPackageMutation();
  const [deletePackage, deleteState] = useDeleteAdminTokenPackageMutation();

  const save = async () => {
    try {
      await updatePackage({ id: item.id, body: bodyFromDraft(draft) }).unwrap();
      toast({ title: 'Пакет обновлён' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Удалить пакет "${item.title}"?`)) return;
    try {
      await deletePackage(item.id).unwrap();
      toast({ title: 'Пакет удалён' });
    } catch (error) {
      toast({ title: errorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-white">{item.title}</h2>
              <Badge className={draft.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}>{draft.isActive ? 'активен' : 'скрыт'}</Badge>
              {draft.isPopular && <Badge className="bg-amber-500 text-slate-950">популярный</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-500">ID: {item.id}</div>
          </div>
          <Button type="button" variant="destructive" size="icon" disabled={deleteState.isLoading} onClick={remove} aria-label="Удалить пакет">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <PackageFields draft={draft} setDraft={setDraft} title="Настройки пакета" />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={updateState.isLoading} onClick={save} className="bg-rose-500 hover:bg-rose-400">
            <Save className="h-4 w-4" />
            Сохранить
          </Button>
          <PreviewBadge draft={draft} />
        </div>
      </CardContent>
    </Card>
  );
}

function PackageFields({
  draft,
  setDraft,
  title,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  title: string;
}) {
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Название">
            <Input value={draft.title} onChange={(event) => update('title', event.target.value)} required />
          </Field>
          <Field label="Подзаголовок">
            <Input value={draft.subtitle} onChange={(event) => update('subtitle', event.target.value)} placeholder={`${totalTokens(draft)} токенов на баланс`} />
          </Field>
          <Field label="Токены">
            <Input type="number" min={1} value={draft.tokens} onChange={(event) => update('tokens', Number(event.target.value))} required />
          </Field>
          <Field label="Бонус">
            <Input type="number" min={0} value={draft.bonus} onChange={(event) => update('bonus', Number(event.target.value))} />
          </Field>
          <Field label="Цена, ₽">
            <Input type="number" min={1} value={draft.priceRub} onChange={(event) => update('priceRub', Number(event.target.value))} required />
          </Field>
          <Field label="Старая цена, ₽">
            <Input value={draft.originalPriceRub} onChange={(event) => update('originalPriceRub', event.target.value)} placeholder="Напр. 1299" />
          </Field>
          <Field label="Бейдж">
            <Input value={draft.badgeText} onChange={(event) => update('badgeText', event.target.value)} placeholder="Выбирают чаще всего" />
          </Field>
          <Field label="Порядок">
            <Input type="number" min={0} value={draft.sortOrder} onChange={(event) => update('sortOrder', Number(event.target.value))} />
          </Field>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
          <Field label="Пункты карточки">
            <Textarea value={draft.featuresText} onChange={(event) => update('featuresText', event.target.value)} rows={5} />
          </Field>
          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={draft.isPopular} onChange={(event) => update('isPopular', event.target.checked)} />
              Популярный пакет
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" checked={draft.isActive} onChange={(event) => update('isActive', event.target.checked)} />
              Показывать на сайте
            </label>
          </div>
        </div>
      </div>

      <TokenPackagePreview draft={draft} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PreviewBadge({ draft }: { draft: Draft }) {
  const discount = discountPercent(draft);
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      <Badge className="bg-zinc-800 text-slate-200">{totalTokens(draft)} токенов</Badge>
      {discount && <Badge className="bg-yellow-400 text-slate-950">-{discount}%</Badge>}
      {draft.bonus > 0 && <Badge className="bg-emerald-700">+{draft.bonus} бонусом</Badge>}
    </div>
  );
}

function TokenPackagePreview({ draft }: { draft: Draft }) {
  const discount = discountPercent(draft);
  const features = draft.featuresText
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
  const badgeText = draft.badgeText.trim() || (draft.isPopular ? 'Выбирают чаще всего' : '');

  return (
    <div className="relative flex min-h-[360px] flex-col rounded-lg border border-zinc-800 bg-slate-950 p-5">
      {(badgeText || discount) && (
        <div className="absolute -top-3 left-4 right-4 flex flex-wrap gap-2">
          {badgeText && <Badge className="bg-amber-500 text-slate-950">{badgeText}</Badge>}
          {discount && <Badge className="bg-yellow-400 text-slate-950">-{discount}%</Badge>}
        </div>
      )}
      <div className="flex items-start justify-between gap-3 pt-3">
        <div>
          <h3 className="text-xl font-semibold text-white">{draft.title || 'Название'}</h3>
          <p className="mt-1 text-sm text-slate-400">{draft.subtitle || `${totalTokens(draft)} токенов на баланс`}</p>
        </div>
        <div className="rounded-md bg-violet-950 p-2 text-amber-400">
          <Coins className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {draft.originalPriceRub && Number(draft.originalPriceRub) > draft.priceRub && (
          <span className="text-lg font-semibold text-slate-500 line-through">{draft.originalPriceRub} ₽</span>
        )}
        <span className="text-3xl font-bold text-white">{draft.priceRub || 0} ₽</span>
        <span className="text-sm text-slate-400">разово</span>
      </div>

      {draft.bonus > 0 && <Badge className="mt-3 w-fit bg-emerald-950 text-emerald-200">+{draft.bonus} токенов бонусом</Badge>}

      <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-300">
        {(features.length ? features : defaultFeatures).map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 rounded-md bg-amber-500 px-4 py-2 text-center font-semibold text-slate-950">Купить</div>
    </div>
  );
}
