'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { Bell, ShieldAlert, User as UserIcon, Wallet } from 'lucide-react';
import type { Payment } from '@allvision/shared';
import { AuthGuard } from '@/components/auth/auth-guard';
import { PaymentRow } from '@/components/dashboard/PaymentRow';
import { TransactionRow } from '@/components/dashboard/TransactionRow';
import { EmptyState } from '@/components/dashboard/EmptyState';
import { PricingCards } from '@/components/public/PricingCards';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import type { AppDispatch } from '@/store';
import { authApi } from '@/store/api/auth-api';
import { TokenIcon } from '@/components/ui/token-icon';
import {
  useChangePasswordMutation,
  useDeleteAccountMutation,
  useGetPaymentsQuery,
  useGetTransactionsQuery,
  useUpdateProfileMutation,
} from '@/store/api/account-api';
import { invalidatePaymentSideEffects, useTopupMutation } from '@/store/api/payments-api';
import { useGetTokenPackagesQuery } from '@/store/api/public-api';
import { clearUser } from '@/store/slices/auth-slice';
import { formatDate } from '@/components/dashboard/labels';
import { cn } from '@/lib/utils';

type ProfileTab = 'personal' | 'billing' | 'transactions' | 'notifications' | 'danger';
type TxFilter = 'all' | 'topup' | 'spending';

const PAGE = 20;

const MESSENGERS = [
  { value: 'TELEGRAM', label: 'Telegram' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'VK', label: 'VK' },
  { value: 'PHONE', label: 'Телефон' },
] as const;

type MType = (typeof MESSENGERS)[number]['value'];

function initialsOf(name: string | null | undefined, email: string) {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]?.toUpperCase() ?? '?';
}

function apiErrorMessage(error: unknown) {
  return (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? 'Операция не выполнена';
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <div className="container py-8">
        <ProfileContent />
      </div>
    </AuthGuard>
  );
}

function ProfileContent() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [tab, setTab] = useState<ProfileTab>((searchParams.get('tab') as ProfileTab) || 'personal');
  const handledPaymentQueryRef = useRef('');

  useEffect(() => {
    const next = searchParams.get('tab') as ProfileTab | null;
    if (next && ['personal', 'billing', 'transactions', 'notifications', 'danger'].includes(next)) setTab(next);
  }, [searchParams]);

  useEffect(() => {
    const paymentResult = searchParams.get('payment');
    if (!paymentResult) return;
    const currentQuery = searchParams.toString();
    if (handledPaymentQueryRef.current === currentQuery) return;
    handledPaymentQueryRef.current = currentQuery;
    const tokens = Number(searchParams.get('tokens') ?? 0);

    if (paymentResult === 'success') {
      toast({ title: tokens > 0 ? `Оплата прошла успешно! +${tokens} токенов` : 'Оплата прошла успешно!' });
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'failed') {
      toast({ title: 'Платёж не прошёл', description: 'Платёж отклонён банком', variant: 'destructive' });
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'pending') {
      toast({ title: 'Платёж принят', description: 'Ждём подтверждение от платёжного провайдера.' });
      invalidatePaymentSideEffects(dispatch);
    }
    if (paymentResult === 'cancelled') {
      toast({ title: 'Платёж отменён' });
      invalidatePaymentSideEffects(dispatch);
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment');
    params.delete('tokens');
    params.set('tab', 'billing');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [dispatch, pathname, router, searchParams, toast]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-violet-300">
          <UserIcon className="h-4 w-4" />
          Профиль
        </div>
        <h1 className="mt-2 text-3xl font-bold text-white">Профиль и баланс</h1>
        <p className="mt-2 text-sm text-slate-400">Личные данные, пополнение, операции и настройки аккаунта.</p>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as ProfileTab)}>
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="personal">Личные данные</TabsTrigger>
          <TabsTrigger value="billing">Баланс</TabsTrigger>
          <TabsTrigger value="transactions">История</TabsTrigger>
          <TabsTrigger value="notifications">Уведомления</TabsTrigger>
          <TabsTrigger value="danger">Удаление</TabsTrigger>
        </TabsList>
        <TabsContent value="personal" className="mt-5">
          <PersonalSection />
        </TabsContent>
        <TabsContent value="billing" className="mt-5">
          <BillingSection />
        </TabsContent>
        <TabsContent value="transactions" className="mt-5">
          <TransactionsSection />
        </TabsContent>
        <TabsContent value="notifications" className="mt-5">
          <NotificationsSection />
        </TabsContent>
        <TabsContent value="danger" className="mt-5">
          <DangerSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PersonalSection() {
  const { user } = useAuth();
  const dispatch = useDispatch<AppDispatch>();
  const { toast } = useToast();
  const [updateProfile, { isLoading: savingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: changingPwd }] = useChangePasswordMutation();
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

  const personalDirty = name.trim() !== (user.name ?? '');
  const contactDirty = messenger !== (user.messenger ?? '') || messengerType !== (user.messengerType ?? '');

  const saveProfile = async (body: { name?: string; messenger?: string | null; messengerType?: MType | null }) => {
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

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_0.8fr]">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle>Личные данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
              <AvatarFallback className="text-lg">{initialsOf(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <div className="text-sm text-slate-400">
              Дата регистрации: {formatDate(user.createdAt as unknown as string)}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly disabled />
            </div>
          </div>
          <Button onClick={() => saveProfile({ name: name.trim() })} disabled={!personalDirty || savingProfile}>
            {savingProfile ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle>Контакт и пароль</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="messengerType">Тип мессенджера</Label>
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
          </div>
          <Button
            variant="outline"
            onClick={() => saveProfile({ messenger: messenger.trim() || null, messengerType: messengerType || null })}
            disabled={!contactDirty || savingProfile}
          >
            Сохранить контакт
          </Button>

          {!showPasswordForm ? (
            <Button variant="outline" onClick={() => setShowPasswordForm(true)}>Сменить пароль</Button>
          ) : (
            <div className="space-y-3 rounded-md border border-slate-800 bg-slate-950 p-4">
              <Input type="password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} placeholder="Текущий пароль" />
              <Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Новый пароль" />
              <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Повторите новый пароль" />
              <div className="flex gap-2">
                <Button onClick={onChangePassword} disabled={changingPwd}>{changingPwd ? 'Меняем...' : 'Сменить'}</Button>
                <Button variant="outline" onClick={() => setShowPasswordForm(false)}>Отмена</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BillingSection() {
  const { user } = useAuth();
  const packages = useGetTokenPackagesQuery();

  if (!user) return null;

  return (
    <div className="space-y-5">
      <Card className="border-amber-500/30 bg-amber-500/10">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-amber-500/20 text-amber-300">
              <TokenIcon className="h-6 w-6" />
            </span>
            <div>
              <div className="text-sm text-slate-300">Ваш баланс</div>
              <div className="text-3xl font-bold text-amber-300">{user.tokenBalance} <span className="text-base font-normal text-slate-300">токенов</span></div>
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
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const [txFilter, setTxFilter] = useState<TxFilter>('all');
  const [txPage, setTxPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [pollPending, setPollPending] = useState(false);
  const [repeatingPaymentId, setRepeatingPaymentId] = useState<string | null>(null);
  const pendingIdsRef = useRef<Set<string>>(new Set());
  const [topup, { isLoading: isRepeating }] = useTopupMutation();
  const txData = useGetTransactionsQuery({ page: txPage, limit: PAGE, type: txFilter });
  const payData = useGetPaymentsQuery({ page: payPage, limit: PAGE }, { pollingInterval: pollPending ? 5000 : 0 });

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
      router.push(result.confirmationUrl);
    } catch {
      toast({ title: 'Не удалось создать новый платёж', variant: 'destructive' });
    } finally {
      setRepeatingPaymentId(null);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>История транзакций</CardTitle>
            <div className="flex flex-wrap gap-2">
              {(['all', 'topup', 'spending'] as TxFilter[]).map((filter) => (
                <Button
                  key={filter}
                  size="sm"
                  variant={txFilter === filter ? 'default' : 'outline'}
                  className={cn(txFilter === filter && 'bg-violet-600 hover:bg-violet-500')}
                  onClick={() => {
                    setTxFilter(filter);
                    setTxPage(1);
                  }}
                >
                  {filter === 'all' ? 'Все' : filter === 'topup' ? 'Пополнения' : 'Списания'}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {txData.isLoading ? (
            <Skeleton className="h-36" />
          ) : !txData.data || txData.data.items.length === 0 ? (
            <EmptyState size="md" icon={<Wallet className="h-full w-full" />} title="Операций пока нет" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-xs uppercase tracking-wide text-slate-400">
                    <tr className="border-b border-slate-800">
                      <th className="px-3 py-2">Дата</th>
                      <th className="px-3 py-2">Тип</th>
                      <th className="px-3 py-2">Описание</th>
                      <th className="px-3 py-2">Сумма</th>
                      <th className="px-3 py-2">Баланс</th>
                    </tr>
                  </thead>
                  <tbody>{txData.data.items.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}</tbody>
                </table>
              </div>
              <Pagination page={txData.data.page} totalPages={txData.data.totalPages} onChange={setTxPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle>Рублёвые платежи</CardTitle>
        </CardHeader>
        <CardContent>
          {payData.isLoading ? (
            <Skeleton className="h-36" />
          ) : !payData.data || payData.data.items.length === 0 ? (
            <EmptyState size="md" icon={<Wallet className="h-full w-full" />} title="Платежей ещё не было" actions={[{ label: 'Пополнить', href: '/profile?tab=billing' }]} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-xs uppercase tracking-wide text-slate-400">
                    <tr className="border-b border-slate-800">
                      <th className="px-3 py-2">Дата</th>
                      <th className="px-3 py-2">Сумма</th>
                      <th className="px-3 py-2">Куда</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payData.data.items.map((payment) => (
                      <PaymentRow
                        key={payment.id}
                        payment={payment}
                        onRepeat={repeatPayment}
                        isRepeating={isRepeating && repeatingPaymentId === payment.id}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={payData.data.page} totalPages={payData.data.totalPages} onChange={setPayPage} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NotificationsSection() {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-violet-300" />
          Настройки уведомлений
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-slate-400">
          Email-уведомления о готовых проектах, платежах и важных изменениях появятся в P7c.
        </p>
        <Button disabled variant="outline">Email-настройки скоро</Button>
      </CardContent>
    </Card>
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
    <Card className="border-red-500/40 bg-slate-900">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-300">
          <ShieldAlert className="h-5 w-5" />
          Удалить аккаунт
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Удаление аккаунта необратимо. Все ваши данные, проекты и заказы будут удалены через 30 дней.
          </AlertDescription>
        </Alert>
        <div className="grid gap-4 md:grid-cols-2">
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
    <div className="mt-4 flex items-center justify-end gap-2">
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
