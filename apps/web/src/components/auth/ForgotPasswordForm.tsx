'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@allvision/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiRequestAlert } from '@/components/auth/ApiRequestAlert';
import { useApiErrorState } from '@/hooks/use-api-error-state';
import { useForgotPasswordMutation } from '@/store/api/auth-api';

export function ForgotPasswordForm() {
  const [forgotMutation, { isLoading, isSuccess, error }] = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });
  const apiError = useApiErrorState(error, 'Не удалось отправить письмо');

  const onSubmit = (values: ForgotPasswordInput) => forgotMutation(values);

  if (isSuccess) {
    return (
      <Alert>
        <AlertDescription>
          Если email зарегистрирован и подтверждён — мы отправили ссылку для восстановления пароля.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <ApiRequestAlert state={apiError} title="Не удалось отправить письмо" />

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting || apiError.locked}>
        {apiError.locked && apiError.retryText ? `Повтор через ${apiError.retryText}` : 'Отправить ссылку'}
      </Button>
    </form>
  );
}
