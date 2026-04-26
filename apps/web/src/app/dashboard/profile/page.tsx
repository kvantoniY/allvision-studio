'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  useUpdateProfileMutation,
  useChangePasswordMutation,
  useDeleteAccountMutation,
} from '@/store/api/account-api';
import { authApi } from '@/store/api/auth-api';
import { clearUser } from '@/store/slices/auth-slice';
import type { AppDispatch } from '@/store';
import { formatDate } from '@/components/dashboard/labels';

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

export default function ProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [updateProfile, { isLoading: savingProfile }] = useUpdateProfileMutation();
  const [changePassword, { isLoading: changingPwd }] = useChangePasswordMutation();
  const [deleteAccount, { isLoading: deleting }] = useDeleteAccountMutation();

  const [name, setName] = useState('');
  const [messenger, setMessenger] = useState('');
  const [messengerType, setMessengerType] = useState<MType | ''>('');

  useEffect(() => {
    if (!user) return;
    setName(user.name ?? '');
    setMessenger(user.messenger ?? '');
    setMessengerType((user.messengerType as MType) ?? '');
  }, [user]);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deletePassword, setDeletePassword] = useState('');

  if (!user) return null;

  const personalDirty = (name ?? '').trim() !== (user.name ?? '');
  const contactDirty =
    (messenger ?? '') !== (user.messenger ?? '') ||
    (messengerType ?? '') !== (user.messengerType ?? '');

  const onSavePersonal = async () => {
    try {
      await updateProfile({ name: name.trim() }).unwrap();
      // Обновим auth-slice через invalidation /auth/me.
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({ title: 'Профиль обновлён' });
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: e?.data?.error?.message ?? 'Не удалось обновить профиль',
        variant: 'destructive',
      });
    }
  };

  const onSaveContact = async () => {
    try {
      await updateProfile({
        messenger: messenger.trim() || null,
        messengerType: messengerType ? (messengerType as MType) : null,
      }).unwrap();
      dispatch(authApi.util.invalidateTags(['Me']));
      toast({ title: 'Контакт сохранён' });
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: e?.data?.error?.message ?? 'Не удалось сохранить контакт',
        variant: 'destructive',
      });
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
      toast({ title: 'Пароль изменён, произведён повторный вход' });
      setShowPasswordForm(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e: any) {
      toast({
        title: 'Ошибка',
        description: e?.data?.error?.message ?? 'Не удалось сменить пароль',
        variant: 'destructive',
      });
    }
  };

  const onDelete = async () => {
    try {
      await deleteAccount({ password: deletePassword, confirmation: 'УДАЛИТЬ' as const }).unwrap();
      dispatch(clearUser());
      dispatch(authApi.util.resetApiState());
      toast({ title: 'Аккаунт удалён' });
      router.replace('/');
    } catch (e: any) {
      toast({
        title: 'Ошибка удаления',
        description: e?.data?.error?.message ?? 'Не удалось удалить аккаунт',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Профиль</h1>
        <p className="mt-1 text-sm text-slate-400">Управление личными данными и безопасностью.</p>
      </div>

      {/* 1. Личные данные */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Личные данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.avatar && <AvatarImage src={user.avatar} alt={user.name ?? user.email} />}
              <AvatarFallback className="text-lg">{initialsOf(user.name, user.email)}</AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" disabled>
              Изменить аватар (скоро)
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user.email} readOnly disabled />
              <p className="text-xs text-slate-500">
                Email нельзя изменить, обратитесь в поддержку
              </p>
            </div>
          </div>

          <div className="text-xs text-slate-500">
            Дата регистрации: {formatDate(user.createdAt as unknown as string)}
          </div>

          <Button onClick={onSavePersonal} disabled={!personalDirty || savingProfile}>
            {savingProfile ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </CardContent>
      </Card>

      {/* 2. Контактные данные */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Контактные данные</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="messengerType">Тип мессенджера</Label>
              <select
                id="messengerType"
                value={messengerType}
                onChange={(e) => setMessengerType(e.target.value as MType | '')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">— не выбран —</option>
                {MESSENGERS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="messenger">Контакт</Label>
              <Input
                id="messenger"
                value={messenger}
                onChange={(e) => setMessenger(e.target.value)}
                placeholder="@username или +7..."
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Используется для связи по заказам услуг 4-6
          </p>
          <Button onClick={onSaveContact} disabled={!contactDirty || savingProfile}>
            {savingProfile ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </CardContent>
      </Card>

      {/* 3. Безопасность */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Безопасность</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showPasswordForm ? (
            <Button variant="outline" onClick={() => setShowPasswordForm(true)}>
              Изменить пароль
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="oldPwd">Текущий пароль</Label>
                <Input
                  id="oldPwd"
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPwd">Новый пароль</Label>
                <Input
                  id="newPwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPwd">Подтверждение нового пароля</Label>
                <Input
                  id="confirmPwd"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={onChangePassword} disabled={changingPwd}>
                  {changingPwd ? 'Меняем…' : 'Сменить пароль'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setOldPassword('');
                    setNewPassword('');
                    setConfirmPassword('');
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. Удаление аккаунта */}
      <Card className="bg-slate-900 border-red-500/40">
        <CardHeader>
          <CardTitle className="text-red-300">Удаление аккаунта</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              Удаление аккаунта необратимо. Все ваши данные, проекты, заказы будут удалены через 30 дней.
            </AlertDescription>
          </Alert>

          {!showDelete ? (
            <Button
              variant="outline"
              className="border-red-500/60 text-red-300 hover:bg-red-500/10"
              onClick={() => setShowDelete(true)}
            >
              Удалить аккаунт
            </Button>
          ) : (
            <div className="space-y-4 rounded-md border border-red-500/40 bg-red-500/5 p-4">
              <p className="font-medium">Вы уверены?</p>
              <div className="space-y-2">
                <Label htmlFor="confirmText">Введите «УДАЛИТЬ» для подтверждения</Label>
                <Input
                  id="confirmText"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delPwd">Текущий пароль</Label>
                <Input
                  id="delPwd"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  disabled={deleteConfirm !== 'УДАЛИТЬ' || !deletePassword || deleting}
                  onClick={onDelete}
                >
                  {deleting ? 'Удаление…' : 'Подтвердить удаление'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDelete(false);
                    setDeleteConfirm('');
                    setDeletePassword('');
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
