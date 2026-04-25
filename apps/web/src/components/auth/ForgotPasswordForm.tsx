'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@allvision/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useForgotPasswordMutation } from '@/store/api/auth-api';

export function ForgotPasswordForm() {
  const [forgotMutation, { isLoading, isSuccess, error }] = useForgotPasswordMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const onSubmit = (values: ForgotPasswordInput) => forgotMutation(values);

  const apiError = (error as { data?: { error?: { message?: string } } } | undefined)?.data?.error
    ?.message;

  if (isSuccess) {
    return (
      <Alert>
        <AlertDescription>
          Если email зарегистрирован — проверьте почту. На этапе разработки ссылка появляется в
          консоли API-сервера.
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

      {apiError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting}>
        Отправить ссылку
      </Button>
    </form>
  );
}
