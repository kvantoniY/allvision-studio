'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CharacterGender, CharacterType } from '@allvision/shared';
import { CHARACTER_SLOT_PRICE_TOKENS } from '@allvision/shared';
import { ArrowLeft, ArrowRight, CheckCircle2, Coins, ShieldCheck, UploadCloud } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiImageUploader, type SelectedImage } from '@/components/ui/multi-image-uploader';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { CHARACTER_TYPE_LABEL, CharacterTypeIcon } from '@/components/studio/v3-labels';
import { toast } from '@/hooks/use-toast';
import { useGetMeQuery } from '@/store/api/auth-api';
import { useCreateCharacterMutation } from '@/store/api/characters-api';
import { cn } from '@/lib/utils';

const characterTypes: CharacterType[] = ['HUMAN', 'PET', 'GROUP', 'MASCOT'];
const genders: Array<{ value: CharacterGender; label: string }> = [
  { value: 'MALE', label: 'Мужской' },
  { value: 'FEMALE', label: 'Женский' },
  { value: 'OTHER', label: 'Другое' },
];
const ageGroups = [
  { value: 'child', label: 'Ребёнок' },
  { value: 'teen', label: 'Подросток' },
  { value: 'adult', label: 'Взрослый' },
  { value: 'senior', label: 'Старший возраст' },
];

function apiErrorMessage(error: unknown) {
  const code = (error as { status?: number; data?: { error?: { code?: string; message?: string } } })?.data?.error?.code;
  if (code === 'CONSENT_REQUIRED') return 'Подтвердите согласие на использование изображения';
  if (code === 'FILE_REQUIRED') return 'Добавьте хотя бы одно фото';
  if (code === 'UNSUPPORTED_FORMAT') return 'Поддерживаются только JPEG, PNG и WebP';
  if (code === 'INSUFFICIENT_TOKENS') return 'Недостаточно токенов для создания персонажа';
  if (code === 'QUEUE_UNAVAILABLE') return 'Проверка фото временно недоступна. Попробуйте ещё раз чуть позже';
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Не удалось создать персонажа';
}

export default function NewCharacterPage() {
  const router = useRouter();
  const { data: meData, isLoading: isMeLoading } = useGetMeQuery();
  const [createCharacter, createState] = useCreateCharacterMutation();
  const [step, setStep] = useState(1);
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CharacterType>('HUMAN');
  const [gender, setGender] = useState<CharacterGender | ''>('');
  const [ageGroup, setAgeGroup] = useState('adult');
  const [description, setDescription] = useState('');
  const [consentGiven, setConsentGiven] = useState(false);

  const me = meData?.user;
  const requiresPayment = !!me?.freeCharacterUsed;
  const balance = me?.tokenBalance ?? 0;
  const totalSteps = requiresPayment ? 4 : 3;
  const canPay = balance >= CHARACTER_SLOT_PRICE_TOKENS;

  useEffect(() => {
    if (step > totalSteps) setStep(totalSteps);
  }, [step, totalSteps]);

  const orderedImages = useMemo(() => {
    if (!primaryId) return images;
    const primary = images.find((image) => image.id === primaryId);
    if (!primary) return images;
    return [primary, ...images.filter((image) => image.id !== primaryId)];
  }, [images, primaryId]);

  const validateStep = (targetStep = step) => {
    if (targetStep === 1 && images.length === 0) {
      toast({ title: 'Добавьте хотя бы одно фото', variant: 'destructive' });
      return false;
    }
    if (targetStep === 2) {
      if (!name.trim()) {
        toast({ title: 'Укажите имя персонажа', variant: 'destructive' });
        return false;
      }
      if (type === 'HUMAN' && (!gender || !ageGroup)) {
        toast({ title: 'Укажите пол и возрастную группу', variant: 'destructive' });
        return false;
      }
    }
    if (targetStep === 3 && !consentGiven) {
      toast({ title: 'Подтвердите согласие на использование изображения', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((current) => Math.min(totalSteps, current + 1));
  };

  const submit = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) return;
    if (requiresPayment && !canPay) {
      setStep(4);
      toast({ title: 'Недостаточно токенов', variant: 'destructive' });
      return;
    }

    const form = new FormData();
    orderedImages.forEach((image) => form.append('images', image.file));
    form.append('name', name.trim());
    form.append('type', type);
    if (type === 'HUMAN' && gender) form.append('gender', gender);
    if (type === 'HUMAN' && ageGroup) form.append('ageGroup', ageGroup);
    if (description.trim()) form.append('description', description.trim());
    form.append('consentGiven', String(consentGiven));

    try {
      const result = await createCharacter(form).unwrap();
      toast({ title: 'Персонаж создан. Проверяем фото' });
      router.push(`/dashboard/characters/${result.character.id}?status=processing`);
    } catch (error) {
      const code = (error as { data?: { error?: { code?: string } } })?.data?.error?.code;
      if (code === 'INSUFFICIENT_TOKENS') setStep(4);
      toast({ title: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  if (isMeLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[520px] rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard/characters">
          <ArrowLeft className="h-4 w-4" />
          К персонажам
        </Link>
      </Button>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Создать персонажа</h1>
          <p className="mt-1 text-slate-400">Шаг {step} из {totalSteps}</p>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const item = index + 1;
            return (
              <span
                key={item}
                className={cn(
                  'h-2.5 w-10 rounded-full transition',
                  item <= step ? 'bg-violet-400' : 'bg-slate-800',
                )}
              />
            );
          })}
        </div>
      </div>

      <Card className="border-slate-800 bg-slate-900">
        <CardContent className="space-y-6 p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-violet-500/10 text-violet-300">
                  <UploadCloud className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">Загрузка фото</h2>
                  <p className="text-sm text-slate-400">Минимум одно изображение, максимум пять.</p>
                </div>
              </div>
              <MultiImageUploader
                value={images}
                onChange={(nextImages) => {
                  setImages(nextImages);
                  if (!primaryId && nextImages[0]) setPrimaryId(nextImages[0].id);
                }}
                maxFiles={5}
                primaryId={primaryId}
                onPrimaryChange={setPrimaryId}
                disabled={createState.isLoading}
                hint="Загрузите 1-5 фото лица. Лучше - несколько ракурсов: анфас, профиль, разные эмоции. Это улучшит схожесть в эпизодах."
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Метаданные</h2>
                <p className="mt-1 text-sm text-slate-400">Эти данные помогут точнее использовать персонажа в будущих эпизодах.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Имя</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
              </div>

              <div className="space-y-3">
                <Label>Тип</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {characterTypes.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setType(item)}
                      className={cn(
                        'flex min-h-14 items-center gap-3 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 text-left text-sm transition',
                        type === item && 'border-violet-400 bg-violet-500/10 text-white',
                      )}
                    >
                      <CharacterTypeIcon type={item} className="h-5 w-5 text-violet-300" />
                      {CHARACTER_TYPE_LABEL[item]}
                    </button>
                  ))}
                </div>
              </div>

              {type === 'HUMAN' && (
                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-3">
                    <Label>Пол</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {genders.map((item) => (
                        <label
                          key={item.value}
                          className={cn(
                            'flex min-h-11 items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm',
                            gender === item.value && 'border-violet-400 bg-violet-500/10',
                          )}
                        >
                          <input
                            type="radio"
                            name="gender"
                            checked={gender === item.value}
                            onChange={() => setGender(item.value)}
                            className="h-4 w-4"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Возрастная группа</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {ageGroups.map((item) => (
                        <label
                          key={item.value}
                          className={cn(
                            'flex min-h-11 items-center gap-2 rounded-md border border-slate-800 bg-slate-950 px-3 text-sm',
                            ageGroup === item.value && 'border-violet-400 bg-violet-500/10',
                          )}
                        >
                          <input
                            type="radio"
                            name="ageGroup"
                            checked={ageGroup === item.value}
                            onChange={() => setAgeGroup(item.value)}
                            className="h-4 w-4"
                          />
                          {item.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Описание</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="напр. 'моя бабушка Ира, добрая, в очках'"
                  rows={4}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-emerald-500/10 text-emerald-300">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">Согласие</h2>
                  <p className="text-sm text-slate-400">Подтверждение обязательно перед проверкой фото.</p>
                </div>
              </div>

              <div className="rounded-md border border-violet-500/30 bg-violet-500/10 p-5 text-sm leading-6 text-slate-200">
                Я подтверждаю, что человек/животное на фото - это я, мой родственник, мой питомец, или у меня есть письменное согласие на использование изображения. Я понимаю, что несу ответственность за legality фото.
              </div>

              <label className="flex gap-3 rounded-md border border-slate-800 bg-slate-950 p-4 text-sm leading-6 text-slate-200">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(event) => setConsentGiven(event.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span>Я подтверждаю согласие и ответственность за использование изображений.</span>
              </label>
              <p className="text-xs text-slate-500">Подробнее об ответственности - в Оферте.</p>
            </div>
          )}

          {step === 4 && requiresPayment && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-500/10 text-amber-300">
                  <Coins className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-semibold">Оплата</h2>
                  <p className="text-sm text-slate-400">Первый персонаж уже использован.</p>
                </div>
              </div>

              <div className="rounded-md border border-slate-800 bg-slate-950 p-5">
                <div className="text-sm text-slate-400">Создание персонажа</div>
                <div className="mt-1 text-3xl font-bold text-white">{CHARACTER_SLOT_PRICE_TOKENS} токенов</div>
                <div className="mt-3 text-sm text-slate-300">Ваш баланс: {balance} токенов</div>
              </div>

              {!canPay && (
                <Alert variant="destructive" className="border-red-500/40 bg-red-500/10">
                  <AlertTitle>Недостаточно токенов</AlertTitle>
                  <AlertDescription>Пополните баланс, чтобы создать второго и следующих персонажей.</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-slate-800 pt-6 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              disabled={step === 1 || createState.isLoading}
            >
              Назад
            </Button>

            {step < totalSteps && (
              <Button type="button" onClick={next} disabled={createState.isLoading}>
                Далее
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}

            {step === 3 && !requiresPayment && (
              <Button type="button" onClick={submit} disabled={createState.isLoading || !consentGiven}>
                <CheckCircle2 className="h-4 w-4" />
                Создать персонажа
              </Button>
            )}

            {step === 4 && requiresPayment && (
              canPay ? (
                <Button type="button" onClick={submit} disabled={createState.isLoading}>
                  <CheckCircle2 className="h-4 w-4" />
                  Создать персонажа за {CHARACTER_SLOT_PRICE_TOKENS} токенов
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/pricing">Пополнить</Link>
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
