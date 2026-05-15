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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRegisterMutation } from '@/store/api/auth-api';
import { setUser } from '@/store/slices/auth-slice';
import { useToast } from '@/hooks/use-toast';

const registerFormSchema = registerSchema.extend({
  consent: z.boolean().refine((value) => value),
});

type FormValues = z.infer<typeof registerFormSchema>;

export function RegisterForm() {
  const router = useRouter();
  const dispatch = useDispatch();
  const { toast } = useToast();
  const [registerMutation, { isLoading, error }] = useRegisterMutation();

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

  const onSubmit = async (values: FormValues) => {
    try {
      const { user } = await registerMutation({
        email: values.email,
        password: values.password,
        name: values.name,
      }).unwrap();
      dispatch(setUser(user));
      toast({
        title: 'Добро пожаловать!',
        description: 'Вам начислено 25 токенов в подарок',
      });
      router.push('/dashboard');
    } catch {
      // ошибка покажется через error ниже
    }
  };

  const mutationError = error as
    | { data?: { error?: { message?: string } }; error?: string }
    | undefined;
  const apiError =
    mutationError?.data?.error?.message ??
    (mutationError?.error
      ? 'Не удалось подключиться к серверу. Проверьте, что API запущен.'
      : undefined);

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
        <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" className="mt-1" {...register('consent')} />
        <span>
          Согласен с{' '}
          <Link href="/offer" className="underline">
            офертой
          </Link>{' '}
          и{' '}
          <Link href="/privacy" className="underline">
            обработкой персональных данных
          </Link>
          .
        </span>
      </label>
      {errors.consent && <p className="text-sm text-destructive">Нужно согласие</p>}

      {apiError && (
        <Alert variant="destructive">
          <AlertDescription>{apiError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={isLoading || isSubmitting}>
        Зарегистрироваться
      </Button>
    </form>
  );
}
