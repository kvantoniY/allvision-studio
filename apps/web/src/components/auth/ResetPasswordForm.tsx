'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@allvision/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiRequestAlert } from '@/components/auth/ApiRequestAlert';
import { useApiErrorState } from '@/hooks/use-api-error-state';
import { useResetPasswordMutation } from '@/store/api/auth-api';
import { useToast } from '@/hooks/use-toast';

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const { toast } = useToast();
  const [resetMutation, { isLoading, error }] = useResetPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, newPassword: '' },
  });
  const apiError = useApiErrorState(error, 'Не удалось сохранить пароль');

  const onSubmit = async (values: ResetPasswordInput) => {
    try {
      await resetMutation({ ...values, token }).unwrap();
      toast({ title: 'Пароль обновлён', description: 'Войдите с новым паролем.' });
      router.push('/login');
    } catch {
      // ошибка в apiError
    }
  };

  if (!token) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Отсутствует токен в ссылке. Запросите новое письмо.</AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <input type="hidden" {...register('token')} />
      <div className="space-y-2">
        <Label htmlFor="newPassword">Новый пароль</Label>
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          {...register('newPassword')}
        />
        {errors.newPassword && (
          <p className="text-sm text-destructive">{errors.newPassword.message}</p>
        )}
      </div>

      <ApiRequestAlert state={apiError} title="Не удалось сохранить пароль" />

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting || apiError.locked}>
        {apiError.locked && apiError.retryText ? `Повтор через ${apiError.retryText}` : 'Сохранить пароль'}
      </Button>
    </form>
  );
}
