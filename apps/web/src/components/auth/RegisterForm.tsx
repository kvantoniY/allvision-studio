'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { registerSchema } from '@allvision/shared';
import { useDispatch } from 'react-redux';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { ApiRequestAlert } from '@/components/auth/ApiRequestAlert';
import { CaptchaField } from '@/components/security/CaptchaField';
import { useApiErrorState } from '@/hooks/use-api-error-state';
import { useCaptchaToken } from '@/hooks/use-captcha-token';
import { useRegisterMutation } from '@/store/api/auth-api';
import { setUser } from '@/store/slices/auth-slice';
import { useToast } from '@/hooks/use-toast';

const registerFormSchema = registerSchema
  .extend({
    consent: z.boolean().refine((value) => value),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Пароли не совпадают',
  });

type FormValues = z.infer<typeof registerFormSchema>;

export function RegisterForm() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const [registerMutation, { isLoading, error }] = useRegisterMutation();
  const captcha = useCaptchaToken();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      consent: false,
    },
  });
  const apiError = useApiErrorState(error, 'Не удалось зарегистрироваться');

  const onSubmit = async (values: FormValues) => {
    try {
      const { user } = await registerMutation({
        email: values.email,
        password: values.password,
        name: values.name,
        captchaToken: captcha.token || undefined,
      }).unwrap();
      dispatch(setUser(user));
      toast({
        title: 'Добро пожаловать в Allvision Academy!',
        description: 'Аккаунт создан. Добавьте профиль ребёнка, чтобы начать.',
      });
      router.push('/');
    } catch {
      captcha.reset();
      // ошибка покажется через error ниже
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Имя</Label>
        <Input id="name" autoComplete="name" {...register('name')} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Пароль</Label>
        <PasswordInput id="password" autoComplete="new-password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Повторите пароль</Label>
        <PasswordInput id="confirmPassword" autoComplete="new-password" {...register('confirmPassword')} />
        {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="mt-1" {...register('consent')} />
        <span>
          Согласен с{' '}
          <Link href="/offer" className="underline">
            офертой
          </Link>
          ,{' '}
          <Link href="/terms" className="underline">
            пользовательским соглашением
          </Link>
          ,{' '}
          <Link href="/privacy" className="underline">
            политикой конфиденциальности
          </Link>{' '}
          и{' '}
          <Link href="/pd-consent" className="underline">
            согласием на обработку персональных данных
          </Link>
          .
        </span>
      </label>
      {errors.consent && <p className="text-sm text-destructive">Нужно согласие</p>}

      <ApiRequestAlert state={apiError} title="Не удалось зарегистрироваться" />

      <CaptchaField token={captcha.token} onTokenChange={captcha.setToken} resetKey={captcha.resetKey} />

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting || apiError.locked || !captcha.solved}>
        {apiError.locked && apiError.retryText ? `Повтор через ${apiError.retryText}` : 'Зарегистрироваться'}
      </Button>
    </form>
  );
}
