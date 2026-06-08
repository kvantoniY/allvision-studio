'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  CreditCard,
  History,
  ImageIcon,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import type { Payment, PaymentStatus, TokenTransaction, UpdateProfileInput } from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { ApiRequestAlert } from '@/components/auth/ApiRequestAlert';
import { CaptchaField } from '@/components/security/CaptchaField';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PricingCards } from '@/components/public/PricingCards';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useApiErrorState } from '@/hooks/use-api-error-state';
import { useCaptchaToken } from '@/hooks/use-captcha-token';
import { useAuth } from '@/hooks/use-auth';
import type { AppDispatch } from '@/store';
import { authApi, useRequestEmailVerificationMutation } from '@/store/api/auth-api';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useGetPaymentsQuery,
  useGetTransactionsQuery,
  useUpdateProfileMutation,
  useUploadProfileAvatarMutation,
} from '@/store/api/account-api';
import {
  invalidatePaymentSideEffects,
  paymentsApi,
  useRecheckPaymentMutation,
  useTopupMutation,
} from '@/store/api/payments-api';
import { useGetTokenPackagesQuery } from '@/store/api/public-api';
import {
  type UserMediaAsset,
  useListUserMediaAssetsQuery,
} from '@/store/api/user-media-assets-api';
import { clearUser } from '@/store/slices/auth-slice';
import { formatDate, formatDateTime, transactionDescription } from '@/components/dashboard/labels';
import { submitPaymentConfirmation, type PaymentConfirmationPayload } from '@/lib/payment-confirmation';
import { cn } from '@/lib/utils';

type ProfileTab = 'account' | 'billing' | 'transactions';
type TxFilter = 'all' | 'topup' | 'spending' | 'payments';
type ProfileUser = NonNullable<ReturnType<typeof useAuth>['user']>;

const PAGE = 20;

const MESSENGERS = [
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'VK', label: 'VK' },
  { value: 'PHONE', label: 'Телефон' },
] as const;

type MType = (typeof MESSENGERS)[number]['value'];

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING: 'Ожидает оплаты',
  SUCCEEDED: 'Оплачен',
  FAILED: 'Ошибка',
  CANCELLED: 'Отменён',
};

const PAYMENT_STATUS_COLOR: Record<PaymentStatus, string> = {
  PENDING: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  SUCCEEDED: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  FAILED: 'bg-red-500/20 text-red-300 border-red-500/30',
  CANCELLED: 'bg-slate-700 text-slate-300 border-slate-600',
};

const PROJECT_REASONS = new Set(['project_created', 'service_launch', 'free_chat', 'library_generation']);

function normalizeProfileTab(value: string | null): ProfileTab {
  if (value === 'billing' || value === 'transactions') return value;
  return 'account';
}

function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

function confirmationPayloadFromPayment(payment: Payment): PaymentConfirmationPayload {
  const metadata = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
    ? payment.metadata as Record<string, unknown>
    : {};
  const confirmationUrl = typeof metadata.confirmationUrl === 'string'
    ? metadata.confirmationUrl
    : `/mock-payment/${payment.providerPaymentId ?? payment.id}`;
  const confirmationMethod = metadata.confirmationMethod === 'POST' ? 'POST' : 'GET';
  const rawParams = metadata.confirmationParams && typeof metadata.confirmationParams === 'object' && !Array.isArray(metadata.confirmationParams)
    ? metadata.confirmationParams as Record<string, unknown>
    : undefined;
  const confirmationParams = rawParams
    ? Object.fromEntries(Object.entries(rawParams).map(([key, value]) => [key, String(value)]))
    : undefined;

  return { confirmationUrl, confirmationMethod, confirmationParams };
}

async function fetchPaymentStatus(dispatch: AppDispatch, paymentId: string) {
  const statusRequest = dispatch(
    paymentsApi.endpoints.getPaymentStatus.initiate(paymentId, { forceRefetch: true }),
  );
  try {
    return await statusRequest.unwrap();
  } finally {
    statusRequest.unsubscribe();
  }
}

function paymentExpiresAt(payment: Payment) {
  if (!payment.expiresAt) return null;
  const value = new Date(payment.expiresAt as Date | string);
  return Number.isNaN(value.getTime()) ? null : value;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <div className="container max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <ProfileContent />
      </div>
    </AuthGuard>
  );
}

function ProfileContent() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [tab, setTab] = useState<ProfileTab>(() => normalizeProfileTab(searchParams.get('tab')));
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const handledPaymentQueryRef = useRef('');

  useEffect(() => {
    setTab(normalizeProfileTab(searchParams.get('tab')));
  }, [searchParams]);

  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    if (!paymentResult) return;
    const currentQuery = searchParams.toString();
    if (handledPaymentQueryRef.current === currentQuery) return;
    handledPaymentQueryRef.current = currentQuery;
    const tokens = Number(searchParams.get('tokens') ?? 0);
    const paymentId = searchParams.get('paymentId');

    if (paymentResult === 'success') {
      toast({ title: tokens > 0 ? `Оплата прошла успешно! +${tokens} токенов` : 'Оплата прошла успешно!' });
      setPendingPaymentId(null);
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'failed') {
      if (paymentId) {
        toast({
          title: 'Платёж не прошёл',
          description: 'Если деньги были списаны, статус обновится в течение нескольких минут.',
          variant: 'destructive',
        });
        setPendingPaymentId(paymentId);
      } else {
        toast({ title: 'Платёж не прошёл', description: 'Платёж отклонён банком.', variant: 'destructive' });
      }
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'pending') {
      toast({
        title: 'Платёж принят',
        description: 'Ждём подтверждение от платёжного провайдера. Это может занять до нескольких минут.',
      });
      if (paymentId) setPendingPaymentId(paymentId);
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'cancelled') {
      if (paymentId) {
        toast({
          title: 'Платёж отменён',
          description: 'Если вы всё-таки оплатили, мы автоматически обновим статус. Это может занять до нескольких минут.',
        });
        setPendingPaymentId(paymentId);
      } else {
        toast({ title: 'Платёж отменён' });
      }
      invalidatePaymentSideEffects(dispatch);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment');
    params.delete('tokens');
    params.delete('paymentId');
    params.set('tab', 'billing');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [dispatch, pathname, router, searchParams, toast]);

  useEffect(() => {
    if (!pendingPaymentId) return;

    let stopped = false;
    let timerId: number | undefined;
    const startedAt = Date.now();
    const maxWaitMs = 10 * 60 * 1000;
    let consecutiveErrors = 0;
    let hintedLongWait = false;
    let lastStatus: PaymentStatus | null = null;

    const scheduleNext = () => {
      if (stopped) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed >= maxWaitMs) {
        toast({
          title: 'Платёж ещё обрабатывается',
          description: 'Если деньги списаны, статус обновится автоматически. Откройте список платежей чуть позже.',
        });
        setPendingPaymentId(null);
        return;
      }
      if (!hintedLongWait && elapsed >= 60_000) {
        hintedLongWait = true;
        toast({
          title: 'Платёж пока в обработке',
          description: 'Иногда подтверждение от Робокассы приходит с задержкой. Подождите ещё немного.',
        });
      }
      const intervalMs = elapsed < 30_000 ? 3_000 : elapsed < 120_000 ? 5_000 : elapsed < 300_000 ? 15_000 : 30_000;
      timerId = window.setTimeout(poll, intervalMs);
    };

    const poll = async () => {
      if (stopped) return;
      try {
        const result = await fetchPaymentStatus(dispatch, pendingPaymentId);
        consecutiveErrors = 0;
        if (stopped) return;

        if (result.status === 'SUCCEEDED') {
          const credited = result.tokensAdded ?? 0;
          toast({
            title: credited > 0 ? `Оплата подтверждена! +${credited} токенов` : 'Оплата подтверждена, токены зачислены.',
          });
          invalidatePaymentSideEffects(dispatch);
          setPendingPaymentId(null);
          return;
        }

        if (
          (result.status === 'FAILED' || result.status === 'CANCELLED') &&
          lastStatus !== null && lastStatus !== result.status
        ) {
          toast({
            title: result.status === 'CANCELLED' ? 'Платёж отменён' : 'Платёж не прошёл',
            variant: 'destructive',
          });
          invalidatePaymentSideEffects(dispatch);
          setPendingPaymentId(null);
          return;
        }

        lastStatus = result.status;
        scheduleNext();
      } catch {
        consecutiveErrors += 1;
        if (consecutiveErrors >= 5 && !stopped) {
          toast({
            title: 'Не удаётся проверить статус',
            description: 'Проверьте интернет-соединение или вернитесь к платежам позже.',
            variant: 'destructive',
          });
          setPendingPaymentId(null);
          return;
        }
        scheduleNext();
      }
    };

    void poll();

    return () => {
      stopped = true;
      if (timerId !== undefined) window.clearTimeout(timerId);
    };
  }, [dispatch, pendingPaymentId, toast]);

  if (!user) return null;

  return (
    <div className="w-full max-w-full space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-violet-300">
            <UserIcon className="h-4 w-4" />
            Профиль
          </div>
          <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">Профиль и баланс</h1>
          <p className="mt-2 text-sm text-slate-400">Данные аккаунта, пополнение и история операций.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => { void logout(); }}
          className="border-slate-700 bg-slate-900 text-slate-200 hover:border-rose-400 hover:text-rose-300"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выйти
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as ProfileTab)} className="min-w-0">
        <TabsList className="h-auto w-full max-w-full justify-start overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/80 p-1 shadow-inner [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto">
          <TabsTrigger className="shrink-0 rounded-md px-3 py-2 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white sm:text-sm" value="account">Аккаунт</TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-md px-3 py-2 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white sm:text-sm" value="billing">Баланс</TabsTrigger>
          <TabsTrigger className="shrink-0 rounded-md px-3 py-2 text-xs data-[state=active]:bg-violet-600 data-[state=active]:text-white sm:text-sm" value="transactions">История</TabsTrigger>
        </TabsList>
        <TabsContent value="account" className="mt-5">
          <AccountSection />
        </TabsContent>
        <TabsContent value="billing" className="mt-5">
          <BillingSection />
        </TabsContent>
        <TabsContent value="transactions" className="mt-5">
          <TransactionsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AccountSection() {
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [updateProfile, { isLoading: savingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: changingPwd }] = useChangePasswordMutation();
  const [requestEmailVerification, emailVerificationState] = useRequestEmailVerificationMutation();
  const emailVerificationError = useApiErrorState(emailVerificationState.error, 'Не удалось отправить письмо');
  const emailCaptcha = useCaptchaToken();
  const [name, setName] = useState('');
  const [messenger, setMessenger] = useState('');
  const [messengerType, setMessengerType] = useState<MType | ''>('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setMessenger(user.messenger ?? '');
    setMessengerType((user.messengerType as MType) ?? '');
  }, [user]);

  if (!user) return null;

  const profileDirty = name.trim() !== (user.name ?? '');
  const contactDirty = messenger !== (user.messenger ?? '') || messengerType !== (user.messengerType ?? '');
  const canSaveProfile = profileDirty && name.trim().length >= 2;

  const saveProfile = async (body: UpdateProfileInput) => {
    try {
      await updateProfile(body).unwrap();
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({ title: 'Профиль обновлён' });
    } catch (error) {
      toast({ title: 'Ошибка', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const onChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: 'Пароли не совпадают', variant: 'destructive' });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: 'Пароль минимум 8 символов', variant: 'destructive' });
      return;
    }
    try {
      await changePassword({ oldPassword, newPassword }).unwrap();
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({ title: 'Пароль изменён' });
      setShowPasswordForm(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast({ title: 'Ошибка', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const onRequestEmailVerification = async () => {
    try {
      const result = await requestEmailVerification({ captchaToken: emailCaptcha.token || undefined }).unwrap();
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({
        title: result.alreadyVerified ? 'Email уже подтверждён' : 'Письмо отправлено',
        description: result.alreadyVerified ? undefined : 'Проверьте почту и перейдите по ссылке подтверждения.',
      });
      emailCaptcha.reset();
    } catch (error) {
      emailCaptcha.reset();
      toast({ title: 'Не удалось отправить письмо', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <div className="grid min-w-0 gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <Card className="min-w-0 overflow-hidden border-slate-800 bg-slate-900">
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <UserIcon className="h-5 w-5 text-violet-300" />
            Профиль
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <AvatarManager user={user} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
              {profileDirty && name.trim().length > 0 && name.trim().length < 2 ? (
                <p className="text-xs text-amber-300">Минимум 2 символа.</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly disabled />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-400">
            <span>Дата регистрации</span>
            <span className="font-medium text-slate-200">{formatDate(user.createdAt as string | Date)}</span>
          </div>
          <Button onClick={() => saveProfile({ name: name.trim() })} disabled={!canSaveProfile || savingProfile}>
            {savingProfile ? 'Сохранение...' : 'Сохранить профиль'}
          </Button>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden border-slate-800 bg-slate-900">
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <MailCheck className="h-5 w-5 text-sky-300" />
            Контакты
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <div className="space-y-2">
            <Label htmlFor="messengerType">Тип связи</Label>
            <select
              id="messengerType"
              value={messengerType}
              onChange={(event) => setMessengerType(event.target.value as MType | '')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Не выбран</option>
              {MESSENGERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="messenger">Контакт</Label>
            <Input id="messenger" value={messenger} onChange={(event) => setMessenger(event.target.value)} placeholder="@username или +7..." />
          </div>
          <Button
            variant="outline"
            onClick={() => saveProfile({ messenger: messenger.trim() || null, messengerType: messengerType || null })}
            disabled={!contactDirty || savingProfile}
          >
            Сохранить контакт
          </Button>
        </CardContent>
      </Card>

      <Card className="min-w-0 overflow-hidden border-slate-800 bg-slate-900">
        <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
            <KeyRound className="h-5 w-5 text-emerald-300" />
            Безопасность
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
          <EmailVerificationPanel
            verifiedAt={user.emailVerifiedAt as string | Date | null}
            loading={emailVerificationState.isLoading}
            errorState={emailVerificationError}
            captcha={emailCaptcha}
            onRequest={onRequestEmailVerification}
          />
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-white">Пароль</div>
                <p className="mt-1 text-sm text-slate-400">Смена пароля для входа в аккаунт.</p>
              </div>
              {!showPasswordForm ? (
                <Button variant="outline" onClick={() => setShowPasswordForm(true)}>Сменить пароль</Button>
              ) : null}
            </div>
            {showPasswordForm ? (
              <div className="mt-4 space-y-3">
                <Input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} placeholder="Текущий пароль" />
                <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Новый пароль" />
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Повторите новый пароль" />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={onChangePassword} disabled={changingPwd}>{changingPwd ? 'Меняем...' : 'Сохранить пароль'}</Button>
                  <Button variant="outline" onClick={() => setShowPasswordForm(false)}>Отмена</Button>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <DangerSection />
    </div>
  );
}

function AvatarManager({ user }: { user: ProfileUser }) {
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatars = useListUserMediaAssetsQuery({ kind: 'user-avatar', limit: 8 });
  const [uploadProfileAvatar, uploadState] = useUploadProfileAvatarMutation();
  const [updateProfile, avatarState] = useUpdateProfileMutation();
  const [previewAvatar, setPreviewAvatar] = useState(user.avatar);
  const busy = uploadState.isLoading || avatarState.isLoading;

  useEffect(() => {
    setPreviewAvatar(user.avatar);
  }, [user.avatar]);

  const setAvatar = async (avatar: string | null, title: string) => {
    try {
      await updateProfile({ avatar }).unwrap();
      setPreviewAvatar(avatar);
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({ title });
    } catch (error) {
      toast({ title: 'Не удалось обновить аватар', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Выберите изображение', variant: 'destructive' });
      input.value = '';
      return;
    }

    const form = new FormData();
    form.append('file', file);

    try {
      const result = await uploadProfileAvatar(form).unwrap();
      setPreviewAvatar(result.user.avatar);
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({ title: 'Аватар обновлён' });
    } catch (error) {
      toast({ title: 'Не удалось загрузить аватар', description: apiErrorMessage(error), variant: 'destructive' });
    } finally {
      input.value = '';
    }
  };

  const studioAvatars = avatars.data?.items ?? [];

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative h-20 w-20 shrink-0">
          <Avatar className="h-20 w-20">
            {previewAvatar && <AvatarImage src={previewAvatar} alt={user.name ?? user.email} />}
            <AvatarFallback className="text-xl">{initialsOf(user.name, user.email)}</AvatarFallback>
          </Avatar>
          <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border border-slate-700 bg-slate-900 text-violet-300">
            <Camera className="h-4 w-4" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-white">Аватар</div>
          <p className="mt-1 text-sm leading-5 text-slate-400">
            Загрузите новое фото или выберите готовый образ из Студии.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={busy}>
              {uploadState.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Загрузить фото
            </Button>
            <Button type="button" variant="outline" onClick={() => setAvatar(null, 'Аватар удалён')} disabled={!previewAvatar || busy}>
              <Trash2 className="h-4 w-4" />
              Убрать
            </Button>
            <Button asChild variant="ghost">
              <Link href="/studio">Открыть Студию</Link>
            </Button>
          </div>
          <input ref={fileInputRef} className="sr-only" type="file" accept="image/*" onChange={uploadAvatar} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
          <ImageIcon className="h-3.5 w-3.5" />
          Из Студии
        </div>
        {avatars.isLoading ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-md" />)}
          </div>
        ) : studioAvatars.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-800 p-3 text-sm text-slate-500">
            В Студии пока нет аватаров. Загруженное фото появится здесь автоматически.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {studioAvatars.map((asset) => {
              const selected = previewAvatar === asset.publicUrl;
              return (
                <button
                  key={asset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setAvatar(asset.publicUrl, 'Аватар выбран из Студии')}
                  className={cn(
                    'group relative aspect-square overflow-hidden rounded-md border bg-slate-900 transition hover:border-violet-400',
                    selected ? 'border-violet-400 ring-2 ring-violet-500/40' : 'border-slate-800',
                  )}
                  title={asset.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={asset.thumbnailUrl || asset.publicUrl} alt="" className="h-full w-full object-cover" />
                  {selected ? (
                    <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-violet-600 text-white">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailVerificationPanel({
  verifiedAt,
  loading,
  errorState,
  captcha,
  onRequest,
}: {
  verifiedAt: string | Date | null;
  loading: boolean;
  errorState: ReturnType<typeof useApiErrorState>;
  captcha: ReturnType<typeof useCaptchaToken>;
  onRequest: () => void;
}) {
  const verified = Boolean(verifiedAt);
  return (
    <div className={cn(
      'min-w-0 rounded-lg border p-3 sm:p-4',
      verified ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10',
    )}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <MailCheck className={cn('mt-0.5 h-5 w-5 shrink-0', verified ? 'text-emerald-300' : 'text-amber-300')} />
          <div className="min-w-0">
            <div className="font-semibold text-white">{verified ? 'Email подтверждён' : 'Email не подтверждён'}</div>
            <p className="mt-1 max-w-xl text-sm leading-5 text-slate-300 sm:leading-6">
              {verified
                ? 'Почта готова для восстановления доступа и важных уведомлений.'
                : 'Подтвердите электронную почту, чтобы восстановить пароль при потере доступа.'}
            </p>
          </div>
        </div>
        {!verified && (
          <div className="w-full min-w-0 max-w-sm">
            <CaptchaField token={captcha.token} onTokenChange={captcha.setToken} resetKey={captcha.resetKey} />
          </div>
        )}
        {!verified && (
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={onRequest} disabled={loading || errorState.locked || !captcha.solved}>
            {loading
              ? 'Отправляем...'
              : errorState.locked && errorState.retryText
                ? `Повтор через ${errorState.retryText}`
                : 'Подтвердить email'}
          </Button>
        )}
      </div>
      {!verified && <div className="mt-4"><ApiRequestAlert state={errorState} title="Не удалось отправить письмо" /></div>}
    </div>
  );
}

function BillingSection() {
  const { user } = useAuth();
  const packages = useGetTokenPackagesQuery();

  if (!user) return null;

  return (
    <div className="min-w-0 space-y-5">
      <Card className="min-w-0 overflow-hidden border-amber-500/30 bg-amber-500/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-amber-500/20 text-amber-300">
              <TokenIcon className="h-6 w-6" />
            </span>
            <div>
              <div className="text-sm text-slate-300">Ваш баланс</div>
              <div className="text-2xl font-bold text-amber-300 sm:text-3xl">{user.tokenBalance} <span className="text-base font-normal text-slate-300">токенов</span></div>
            </div>
          </div>
          <Button asChild className="bg-amber-500 text-slate-950 hover:bg-amber-400">
            <Link href="#packages">Пополнить</Link>
          </Button>
        </CardContent>
      </Card>

      <div id="packages" className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Пакеты токенов</h2>
        <PricingCards packages={packages.data?.packages} isLoading={packages.isLoading} fallbackHref="/login?redirect=/profile" />
      </div>
    </div>
  );
}

function TransactionsSection() {
  const { toast } = useToast();
  const dispatch = useDispatch<AppDispatch>();
  const [filter, setFilter] = useState<TxFilter>('all');
  const [txPage, setTxPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [pollPending, setPollPending] = useState(false);
  const [repeatingPaymentId, setRepeatingPaymentId] = useState<string | null>(null);
  const [resumingPaymentId, setResumingPaymentId] = useState<string | null>(null);
  const [recheckingPaymentId, setRecheckingPaymentId] = useState<string | null>(null);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [topup, { isLoading: isRepeating }] = useTopupMutation();
  const [recheckPayment] = useRecheckPaymentMutation();
  const txType = filter === 'topup' || filter === 'spending' ? filter : 'all';
  const txData = useGetTransactionsQuery({ page: txPage, limit: PAGE, type: txType });
  const payData = useGetPaymentsQuery({ page: payPage, limit: PAGE }, { pollingInterval: pollPending ? 5000 : 0 });
  const showTransactions = filter !== 'payments';
  const showPayments = filter === 'all' || filter === 'payments';
  const txItems = txData.data?.items ?? [];
  const paymentItems = payData.data?.items ?? [];
  const loadingVisible = (showTransactions && txData.isLoading) || (showPayments && payData.isLoading);
  const hasVisibleItems = (showTransactions && txItems.length > 0) || (showPayments && paymentItems.length > 0);

  useEffect(() => {
    const items = payData.data?.items ?? [];
    const previousPending = pendingIdsRef.current;
    const completed = items.find((payment) => previousPending.has(payment.id) && payment.status === 'SUCCEEDED');
    const nextPending = new Set(items.filter((payment) => payment.status === 'PENDING').map((payment) => payment.id));
    if (completed) {
      toast({ title: completed.tokensAdded ? `Оплата прошла успешно! +${completed.tokensAdded} токенов` : 'Оплата прошла успешно!' });
      invalidatePaymentSideEffects(dispatch);
    }
    pendingIdsRef.current = nextPending;
    setPollPending(nextPending.size > 0);
  }, [dispatch, payData.data?.items, toast]);

  const selectFilter = (next: TxFilter) => {
    setFilter(next);
    setTxPage(1);
    setPayPage(1);
  };

  const repeatPayment = async (payment: Payment) => {
    const metadata = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
      ? (payment.metadata as Record<string, unknown>)
      : {};
    const tokenPackageId = typeof metadata.tokenPackageId === 'string' ? metadata.tokenPackageId : null;
    if (!tokenPackageId) {
      toast({ title: 'Не удалось повторить покупку', variant: 'destructive' });
      return;
    }
    setRepeatingPaymentId(payment.id);
    try {
      const result = await topup({ tokenPackageId }).unwrap();
      submitPaymentConfirmation(result);
    } catch {
      toast({ title: 'Не удалось создать новый платёж', variant: 'destructive' });
    } finally {
      setRepeatingPaymentId(null);
    }
  };

  const handleRecheck = async (payment: Payment) => {
    setRecheckingPaymentId(payment.id);
    try {
      const result = await recheckPayment(payment.id).unwrap();
      if (result.status === 'SUCCEEDED') {
        const credited = result.tokensAdded ?? payment.tokensAdded ?? 0;
        toast({
          title: credited > 0 ? `Оплата подтверждена! +${credited} токенов` : 'Оплата подтверждена.',
        });
        invalidatePaymentSideEffects(dispatch);
      } else if (result.status === 'PENDING') {
        toast({
          title: 'Платёж ещё в обработке',
          description: 'Робокасса пока не подтвердила оплату. Подождите 1-2 минуты и попробуйте ещё раз.',
        });
      } else if (result.status === 'CANCELLED') {
        toast({
          title: 'Платёж отменён',
          description: 'Со стороны Робокассы платёж помечен как отменённый. Если деньги списались, напишите в поддержку.',
          variant: 'destructive',
        });
      } else if (result.status === 'FAILED') {
        toast({
          title: 'Платёж не прошёл',
          description: 'Если деньги были списаны, напишите в поддержку с номером платежа.',
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: 'Не удалось проверить платёж',
        description: 'Попробуйте ещё раз через несколько секунд.',
        variant: 'destructive',
      });
    } finally {
      setRecheckingPaymentId(null);
    }
  };

  const resumePayment = async (payment: Payment) => {
    setResumingPaymentId(payment.id);
    try {
      const result = await fetchPaymentStatus(dispatch, payment.id);

      if (result.status === 'SUCCEEDED') {
        const credited = result.tokensAdded ?? payment.tokensAdded ?? 0;
        toast({ title: credited > 0 ? `Оплата прошла успешно! +${credited} токенов` : 'Оплата прошла успешно!' });
        invalidatePaymentSideEffects(dispatch);
        return;
      }
      if (result.status === 'FAILED' || result.status === 'CANCELLED') {
        toast({ title: 'Платёж уже не активен', description: 'Создайте новое пополнение.', variant: 'destructive' });
        invalidatePaymentSideEffects(dispatch);
        return;
      }

      submitPaymentConfirmation(confirmationPayloadFromPayment(payment));
    } catch {
      toast({ title: 'Не удалось проверить платёж', description: 'Попробуйте ещё раз через несколько секунд.', variant: 'destructive' });
    } finally {
      setResumingPaymentId(null);
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden border-slate-800 bg-slate-900">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <History className="h-5 w-5 text-violet-300" />
              История
            </CardTitle>
            <p className="mt-1 text-sm text-slate-400">Операции с токенами и платежи в одном списке.</p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-slate-800 bg-slate-950/60 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {([
              { id: 'all', label: 'Все' },
              { id: 'topup', label: 'Пополнения' },
              { id: 'spending', label: 'Списания' },
              { id: 'payments', label: 'Платежи' },
            ] as const).map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={filter === item.id ? 'default' : 'outline'}
                className={cn(
                  'shrink-0 border-0 px-3',
                  filter === item.id
                    ? 'bg-violet-600 hover:bg-violet-500'
                    : 'bg-transparent text-slate-300 hover:bg-slate-800',
                )}
                onClick={() => selectFilter(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-5 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        {loadingVisible ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
            <Skeleton className="h-16 rounded-md" />
          </div>
        ) : !hasVisibleItems ? (
          <EmptyState size="md" icon={<Wallet className="h-full w-full" />} title="Операций пока нет" actions={[{ label: 'Пополнить баланс', href: '/profile?tab=billing' }]} />
        ) : (
          <>
            {showTransactions && txItems.length > 0 ? (
              <HistoryGroup
                title={filter === 'topup' ? 'Пополнения токенов' : filter === 'spending' ? 'Списания токенов' : 'Токены'}
                count={txData.data?.total}
              >
                {txItems.map((tx) => <TransactionListItem key={tx.id} tx={tx} />)}
                <Pagination page={txData.data?.page ?? 1} totalPages={txData.data?.totalPages ?? 1} onChange={setTxPage} />
              </HistoryGroup>
            ) : null}

            {showPayments && paymentItems.length > 0 ? (
              <HistoryGroup title="Платежи" count={payData.data?.total}>
                {paymentItems.map((payment) => (
                  <PaymentListItem
                    key={payment.id}
                    payment={payment}
                    onRepeat={repeatPayment}
                    onResume={resumePayment}
                    onRecheck={handleRecheck}
                    isRepeating={isRepeating && repeatingPaymentId === payment.id}
                    isResuming={resumingPaymentId === payment.id}
                    isRechecking={recheckingPaymentId === payment.id}
                  />
                ))}
                <Pagination page={payData.data?.page ?? 1} totalPages={payData.data?.totalPages ?? 1} onChange={setPayPage} />
              </HistoryGroup>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryGroup({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase text-slate-400">{title}</h2>
        {typeof count === 'number' ? <span className="text-xs text-slate-500">{count}</span> : null}
      </div>
      <div className="divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
        {children}
      </div>
    </section>
  );
}

function TransactionListItem({ tx }: { tx: TokenTransaction }) {
  const isTopup = tx.amount > 0;
  return (
    <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 gap-3">
        <span
          className={cn(
            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            isTopup ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
          )}
        >
          {isTopup ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <div className="font-medium text-white">{transactionDescription(tx.reason)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{formatDateTime(tx.createdAt)}</span>
            {tx.refId && PROJECT_REASONS.has(tx.reason) ? (
              <Link href={`/dashboard/projects/${tx.refId}`} className="text-violet-300 hover:underline">
                см. проект
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
        <div
          className={cn(
            'whitespace-nowrap text-sm font-semibold',
            isTopup ? 'text-emerald-400' : 'text-red-400',
          )}
        >
          {isTopup ? '+' : ''}
          {tx.amount} токен.
        </div>
        <div className="whitespace-nowrap text-xs text-slate-500">баланс {tx.balanceAfter}</div>
      </div>
    </div>
  );
}

function PaymentListItem({
  payment,
  onRepeat,
  onResume,
  onRecheck,
  isRepeating,
  isResuming,
  isRechecking,
}: {
  payment: Payment;
  onRepeat?: (payment: Payment) => void;
  onResume?: (payment: Payment) => void;
  onRecheck?: (payment: Payment) => void;
  isRepeating?: boolean;
  isResuming?: boolean;
  isRechecking?: boolean;
}) {
  const purpose = payment.purpose === 'TOPUP' ? 'Пополнение баланса' : `Заказ #${payment.id.slice(0, 6)}`;
  const metadata = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata)
    ? payment.metadata as Record<string, unknown>
    : {};
  const confirmationUrl =
    'confirmationUrl' in metadata
      ? String(metadata.confirmationUrl)
      : undefined;
  const confirmationMethod = metadata.confirmationMethod === 'POST' ? 'POST' : 'GET';
  const confirmationParams = metadata.confirmationParams && typeof metadata.confirmationParams === 'object' && !Array.isArray(metadata.confirmationParams)
    ? metadata.confirmationParams as Record<string, unknown>
    : undefined;
  const confirmationHref = confirmationUrl ?? `/mock-payment/${payment.providerPaymentId ?? payment.id}`;
  const expiresAt = useMemo(() => paymentExpiresAt(payment), [payment]);
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = expiresAt ? expiresAt.getTime() - now : null;
  const paymentExpired = payment.status === 'PENDING' && remainingMs !== null && remainingMs <= 0;
  const canContinuePayment = payment.status === 'PENDING' && !paymentExpired;
  const resumeLabel = isResuming ? 'Проверяем...' : 'Продолжить оплату';

  useEffect(() => {
    if (payment.status !== 'PENDING' || !expiresAt) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt, payment.status]);

  return (
    <div className="flex flex-col gap-3 p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
            <CreditCard className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="font-medium text-white">{purpose}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span>{formatDateTime(payment.createdAt)}</span>
              <Badge
                className={cn(
                  'rounded-md border px-2 py-0.5 text-[11px]',
                  paymentExpired ? 'border-slate-600 bg-slate-700 text-slate-300' : PAYMENT_STATUS_COLOR[payment.status],
                )}
              >
                {paymentExpired ? 'Время истекло' : PAYMENT_STATUS_LABEL[payment.status]}
              </Badge>
              {payment.status === 'PENDING' && expiresAt ? (
                <span className={cn(paymentExpired ? 'text-slate-500' : 'text-amber-200')}>
                  {paymentExpired ? 'срок оплаты истёк' : `осталось ${formatRemaining(remainingMs ?? 0)}`}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:block sm:text-right">
          <div className="whitespace-nowrap text-sm font-semibold text-amber-300">
            {(payment.amountRub / 100).toLocaleString('ru-RU')} ₽
          </div>
          {payment.tokensAdded ? (
            <div className="whitespace-nowrap text-xs text-slate-500">+{payment.tokensAdded} токенов</div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-0 sm:pl-11">
        {canContinuePayment && confirmationMethod === 'POST' && confirmationParams ? (
          <form
            method="POST"
            action={confirmationHref}
            onSubmit={(event) => {
              if (!onResume) return;
              event.preventDefault();
              onResume(payment);
            }}
          >
            {Object.entries(confirmationParams).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={String(value)} />
            ))}
            <Button type="submit" size="sm" variant="default" disabled={isResuming}>
              {resumeLabel}
            </Button>
          </form>
        ) : canContinuePayment ? (
          onResume ? (
            <Button size="sm" variant="default" disabled={isResuming} onClick={() => onResume(payment)}>
              {resumeLabel}
            </Button>
          ) : (
            <Button asChild size="sm" variant="default">
              <Link href={confirmationHref}>Продолжить оплату</Link>
            </Button>
          )
        ) : paymentExpired ? (
          <Button size="sm" variant="outline" disabled>
            Время истекло
          </Button>
        ) : payment.status === 'FAILED' || payment.status === 'CANCELLED' ? (
          <Button size="sm" variant="outline" disabled={isRepeating} onClick={() => onRepeat?.(payment)}>
            Повторить покупку
          </Button>
        ) : null}

        {onRecheck && payment.status !== 'SUCCEEDED' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={isRechecking}
            onClick={() => onRecheck(payment)}
            title="Проверить, не зачислены ли деньги на стороне Робокассы"
          >
            {isRechecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Проверить
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function DangerSection() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [deleteAccount, { isLoading: deleting }] = useDeleteAccountMutation();
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  const onDelete = async () => {
    try {
      await deleteAccount({ password: deletePassword, confirmation: 'УДАЛИТЬ' as const }).unwrap();
      dispatch(clearUser());
      dispatch(authApi.util.resetApiState());
      toast({ title: 'Аккаунт удалён' });
      router.replace('/');
    } catch (error) {
      toast({ title: 'Ошибка удаления', description: apiErrorMessage(error), variant: 'destructive' });
    }
  };

  return (
    <Card className="min-w-0 overflow-hidden border-red-500/40 bg-slate-900">
      <CardHeader className="p-4 pb-3 sm:p-6 sm:pb-3">
        <CardTitle className="flex items-center gap-2 text-xl text-red-300 sm:text-2xl">
          <ShieldAlert className="h-5 w-5" />
          Удаление аккаунта
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-0 sm:px-6 sm:pb-6">
        <Alert variant="destructive">
          <AlertDescription>
            Удаление аккаунта необратимо. Данные, проекты и заказы будут удалены через 30 дней.
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          <div className="space-y-2">
            <Label htmlFor="confirmText">Введите «УДАЛИТЬ»</Label>
            <Input id="confirmText" value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deletePassword">Текущий пароль</Label>
            <Input id="deletePassword" type="password" value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
          </div>
        </div>
        <Button variant="destructive" disabled={deleteConfirm !== 'УДАЛИТЬ' || !deletePassword || deleting} onClick={onDelete}>
          {deleting ? 'Удаление...' : 'Подтвердить удаление'}
        </Button>
      </CardContent>
    </Card>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 p-3">
      <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Назад
      </Button>
      <span className="text-sm text-slate-400">{page} / {totalPages}</span>
      <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Вперёд
      </Button>
    </div>
  );
}
