'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Coins, ImagePlus, Loader2, Lock, Sparkles, Star } from 'lucide-react';
import type { PublicService, ServiceCategory } from '@allvision/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useGetServiceQuery, useLaunchServiceMutation } from '@/store/api/services-api';
import { cn } from '@/lib/utils';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type ServiceDetailProps = {
  slug: string;
};

type UserInputOption = {
  value: string;
  label: string;
};

type UserInputField = {
  id: string;
  type: 'text' | 'textarea' | 'photo' | 'select' | 'avatar' | 'tier';
  label?: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  maxLength?: number;
  options?: UserInputOption[];
};

type FormValues = Record<string, string>;
type FileValues = Record<string, File | undefined>;

const categoryLabels: Record<string, string> = {
  NOSTALGIA: 'Ностальгия',
  TRENDS_MEMES: 'Тренды и мемы',
  KIDS_HEROES: 'Дети-герои',
  SPECIAL_OCCASIONS: 'Особые поводы',
};

function mediaUrl(value?: string | null) {
  if (!value) return null;
  if (value.startsWith('/static/')) return `${API_URL}${value}`;
  return value;
}

function previewImage(service: PublicService) {
  return mediaUrl(service.previewImage ?? service.coverImage ?? service.galleryImages[0]) ?? 'https://picsum.photos/seed/allvision-detail/1200/800';
}

function parseFields(value: unknown): UserInputField[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      type: typeof item.type === 'string' ? (item.type as UserInputField['type']) : 'text',
      label: typeof item.label === 'string' ? item.label : undefined,
      required: item.required === true,
      hint: typeof item.hint === 'string' ? item.hint : undefined,
      placeholder: typeof item.placeholder === 'string' ? item.placeholder : undefined,
      maxLength: typeof item.maxLength === 'number' ? item.maxLength : undefined,
      options: Array.isArray(item.options)
        ? item.options
            .filter((option): option is Record<string, unknown> => !!option && typeof option === 'object' && !Array.isArray(option))
            .map((option) => ({
              value: String(option.value ?? ''),
              label: String(option.label ?? option.value ?? ''),
            }))
        : undefined,
    }))
    .filter((item) => item.id && ['text', 'textarea', 'photo', 'select', 'avatar', 'tier'].includes(item.type));
}

function priceFor(service: PublicService, tier: 'standard' | 'pro') {
  if (tier === 'pro') return service.priceCoinsPro ?? service.priceTokens;
  return service.priceCoinsStandard ?? service.priceTokens;
}

function getErrorCode(error: unknown): string | undefined {
  return (error as { data?: { error?: { code?: string } } })?.data?.error?.code;
}

function getErrorMessage(error: unknown): string | undefined {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message;
}

function validateClient(fields: UserInputField[], values: FormValues, files: FileValues, tier: 'standard' | 'pro') {
  const errors: string[] = [];
  if (tier !== 'standard' && tier !== 'pro') errors.push('Выберите качество');
  for (const field of fields) {
    if (field.type === 'tier') continue;
    if (field.type === 'photo') {
      if (field.required && !files[field.id]) errors.push(`Загрузите файл: ${field.label ?? field.id}`);
      continue;
    }
    const value = values[field.id]?.trim();
    if (field.required && !value) errors.push(`Заполните поле: ${field.label ?? field.id}`);
    if (field.maxLength && value && value.length > field.maxLength) {
      errors.push(`Поле ${field.label ?? field.id} слишком длинное`);
    }
  }
  return errors;
}

function FieldControl({
  field,
  value,
  file,
  onValueChange,
  onFileChange,
}: {
  field: UserInputField;
  value?: string;
  file?: File;
  onValueChange: (id: string, value: string) => void;
  onFileChange: (id: string, file?: File) => void;
}) {
  if (field.type === 'tier') return null;

  const label = field.label ?? field.id;
  const required = field.required ? <span className="text-amber-300">*</span> : null;

  if (field.type === 'photo') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <label
          htmlFor={field.id}
          className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950/60 p-5 text-center transition hover:border-amber-400"
        >
          <ImagePlus className="h-8 w-8 text-slate-500" />
          <span className="mt-3 text-sm font-medium text-slate-200">
            {file ? file.name : 'Загрузить фото'}
          </span>
          {field.hint && <span className="mt-1 text-xs text-slate-500">{field.hint}</span>}
        </label>
        <Input
          id={field.id}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => onFileChange(field.id, event.target.files?.[0])}
        />
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <Textarea
          id={field.id}
          value={value ?? ''}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => onValueChange(field.id, event.target.value)}
        />
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>{label} {required}</Label>
        <select
          id={field.id}
          value={value ?? ''}
          onChange={(event) => onValueChange(field.id, event.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">Выберите вариант</option>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
      </div>
    );
  }

  if (field.type === 'avatar') {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-4">
        <div className="font-medium">{label} {required}</div>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Для этой услуги нужен готовый аватар. Создать и выбрать его можно в кабинете.
        </p>
        <Button asChild variant="outline" className="mt-3 border-slate-700 bg-slate-900">
          <Link href="/dashboard/characters">Открыть аватары</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>{label} {required}</Label>
      <Input
        id={field.id}
        value={value ?? ''}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={(event) => onValueChange(field.id, event.target.value)}
      />
      {field.hint && <p className="text-xs leading-5 text-slate-500">{field.hint}</p>}
    </div>
  );
}

export function ServiceDetail({ slug }: ServiceDetailProps) {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const { data, isLoading, isError } = useGetServiceQuery(slug);
  const [launchService, launchState] = useLaunchServiceMutation();
  const [tier, setTier] = useState<'standard' | 'pro'>('standard');
  const [values, setValues] = useState<FormValues>({});
  const [files, setFiles] = useState<FileValues>({});

  const service = data?.service;
  const fields = useMemo(() => parseFields(service?.userInputForm), [service?.userInputForm]);

  if (isLoading) {
    return (
      <div className="container py-14">
        <Skeleton className="h-[520px] rounded-xl" />
      </div>
    );
  }

  if (isError || !service) {
    return (
      <section className="container py-20">
        <Card className="max-w-2xl border-slate-800 bg-slate-900">
          <CardContent className="p-8">
            <h1 className="text-3xl font-bold">Услуга не найдена</h1>
            <p className="mt-3 text-slate-400">Возможно, ссылка устарела или услуга временно скрыта из каталога.</p>
            <Button asChild className="mt-6">
              <Link href="/services">Вернуться к услугам</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  const price = priceFor(service, tier);
  const balance = user?.tokenBalance ?? 0;
  const hasEnoughCoins = !!user && balance >= price;
  const preview = previewImage(service);
  const previewVideo = mediaUrl(service.previewVideo);
  const loginHref = `/login?redirect=/services/${service.slug}`;

  const setFieldValue = (id: string, value: string) => {
    setValues((current) => ({ ...current, [id]: value }));
  };

  const setFieldFile = (id: string, file?: File) => {
    setFiles((current) => ({ ...current, [id]: file }));
  };

  const submit = async () => {
    if (!user) {
      router.push(loginHref);
      return;
    }
    if (!hasEnoughCoins) {
      toast({
        title: 'Недостаточно коинов',
        description: `Нужно ${price}, на балансе ${balance}.`,
        variant: 'destructive',
      });
      router.push('/pricing');
      return;
    }

    const errors = validateClient(fields, values, files, tier);
    if (errors.length > 0) {
      toast({
        title: 'Проверьте форму',
        description: errors[0],
        variant: 'destructive',
      });
      return;
    }

    const dataPayload: FormValues = { ...values };
    const tierField = fields.find((field) => field.type === 'tier');
    dataPayload[tierField?.id ?? 'tier'] = tier;

    const formData = new FormData();
    formData.append('data', JSON.stringify(dataPayload));
    for (const field of fields) {
      if (field.type !== 'photo') continue;
      const file = files[field.id];
      if (file) formData.append(field.id, file);
    }

    try {
      const result = await launchService({ slug: service.slug, formData }).unwrap();
      router.push(`/dashboard/projects/${result.project.id}`);
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'INSUFFICIENT_TOKENS') {
        toast({
          title: 'Недостаточно коинов',
          description: 'Пополните баланс и запустите услугу снова.',
          variant: 'destructive',
        });
        router.push('/pricing');
        return;
      }
      toast({
        title: 'Запуск не удался',
        description: getErrorMessage(error) ?? 'Попробуйте ещё раз через несколько минут.',
        variant: 'destructive',
      });
    }
  };

  return (
    <section className="container py-10 md:py-14">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        <div className="space-y-8">
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
            {previewVideo ? (
              <video src={previewVideo} muted loop playsInline autoPlay controls className="max-h-[620px] w-full object-cover" />
            ) : (
              <div className="relative aspect-[16/10]">
                <Image src={preview} alt={service.title} fill priority sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover" />
              </div>
            )}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="bg-slate-800 text-indigo-100">
                {categoryLabels[service.category as ServiceCategory] ?? service.category}
              </Badge>
              {service.isFeatured && (
                <Badge className="border-amber-300/60 bg-amber-400 text-slate-950">
                  <Star className="h-3.5 w-3.5" />
                  Популярное
                </Badge>
              )}
            </div>
            <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight md:text-6xl">{service.title}</h1>
            <p className="mt-5 text-lg leading-8 text-slate-300">{service.description}</p>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-400" />
              <h2 className="text-2xl font-bold tracking-tight">Как это работает</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {['Загрузите фото или выберите параметры подарка.', 'Allvision запускает подготовленный AI-pipeline.', 'Готовый результат появится в кабинете.'].map((item, index) => (
                <Card key={item} className="border-slate-800 bg-slate-900">
                  <CardContent className="p-5">
                    <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                    <div className="mt-4 text-sm font-semibold text-amber-400">Шаг {index + 1}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{item}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900 lg:sticky lg:top-6">
          <CardHeader>
            <CardTitle className="text-xl">Создать подарок</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {(['standard', 'pro'] as const).map((item) => {
                const active = tier === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTier(item)}
                    className={cn(
                      'rounded-lg border p-4 text-left transition',
                      active ? 'border-amber-400 bg-amber-400 text-slate-950' : 'border-slate-700 bg-slate-950 text-slate-100 hover:border-slate-500',
                    )}
                  >
                    <div className="text-sm font-semibold">{item === 'standard' ? 'Standard' : 'Pro'}</div>
                    <div className="mt-1 text-xl font-black">{priceFor(service, item)}</div>
                    <div className={cn('mt-1 text-xs', active ? 'text-slate-800' : 'text-slate-500')}>коинов</div>
                  </button>
                );
              })}
            </div>

            {!user && !isAuthLoading ? (
              <Alert className="border-slate-700 bg-slate-950">
                <Lock className="h-4 w-4" />
                <AlertTitle>Нужен вход</AlertTitle>
                <AlertDescription className="mt-2">
                  <Button asChild className="mt-3 bg-amber-500 text-slate-950 hover:bg-amber-400">
                    <Link href={loginHref}>Войти, чтобы создать</Link>
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="space-y-5">
                  {fields
                    .filter((field) => field.type !== 'tier')
                    .map((field) => (
                      <FieldControl
                        key={field.id}
                        field={field}
                        value={values[field.id]}
                        file={files[field.id]}
                        onValueChange={setFieldValue}
                        onFileChange={setFieldFile}
                      />
                    ))}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-slate-400">Ваш баланс</span>
                    <span className={cn('font-bold', hasEnoughCoins ? 'text-emerald-300' : 'text-amber-300')}>
                      {balance} коинов
                    </span>
                  </div>
                  {!hasEnoughCoins && (
                    <div className="mt-3 flex items-start gap-2 text-sm text-amber-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>Недостаточно коинов для запуска выбранного качества.</span>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={submit}
                  disabled={launchState.isLoading || isAuthLoading}
                  className="w-full bg-amber-500 text-slate-950 hover:bg-amber-400"
                  size="lg"
                >
                  {launchState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                  Создать за {price} коинов
                </Button>
                {!hasEnoughCoins && user && (
                  <Button asChild variant="outline" className="w-full border-slate-700 bg-slate-950">
                    <Link href="/pricing">Пополнить баланс</Link>
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
