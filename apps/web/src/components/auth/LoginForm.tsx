'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@allvision/shared';
import { useDispatch } from 'react-redux';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiRequestAlert } from '@/components/auth/ApiRequestAlert';
import { useApiErrorState } from '@/hooks/use-api-error-state';
import { useLoginMutation } from '@/store/api/auth-api';
import { setUser } from '@/store/slices/auth-slice';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const dispatch = useDispatch();
  const [loginMutation, { isLoading, error }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const apiError = useApiErrorState(error, 'Не удалось войти');

  const onSubmit = async (values: LoginInput) => {
    try {
      const { user } = await loginMutation(values).unwrap();
      dispatch(setUser(user));
      router.push(params.get('redirect') ?? '/dashboard');
    } catch {
      // ошибка в apiError
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <ApiRequestAlert state={apiError} title="Не удалось войти" />

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting || apiError.locked}>
        {apiError.locked && apiError.retryText ? `Повтор через ${apiError.retryText}` : 'Войти'}
      </Button>
    </form>
  );
}
