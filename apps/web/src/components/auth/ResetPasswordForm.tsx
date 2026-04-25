'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@allvision/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

  const onSubmit = async (values: ResetPasswordInput) => {
    try {
      await resetMutation({ ...values, token }).unwrap();
      toast({ title: 'Пароль обновлён', description: 'Войдите с новым паролем.' });
      router.push('/login');
    } catch {
      // ошибка в apiError
    }
  };

  const apiError = (error as { data?: { error?: { message?: string } } } | undefined)?.data?.error
    ?.message;

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

      {apiError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting}>
        Сохранить пароль
      </Button>
    </form>
  );
}
