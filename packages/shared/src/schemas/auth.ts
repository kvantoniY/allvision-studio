import { z } from 'zod';

const russianEmailDomainSuffixes = ['.ru', '.рф', '.xn--p1ai', '.su'];

export const russianEmailMessage =
  'Используйте российскую почту: mail.ru, yandex.ru, bk.ru, ya.ru или домен .ru/.рф/.su';

export function isRussianEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@').pop()?.replace(/\.$/, '');

  if (!domain) {
    return false;
  }

  return russianEmailDomainSuffixes.some((suffix) => domain === suffix.slice(1) || domain.endsWith(suffix));
}

const russianEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Некорректный email')
  .refine(isRussianEmail, russianEmailMessage);

export const registerSchema = z.object({
  email: russianEmailSchema,
  password: z.string().min(8, 'Минимум 8 символов'),
  name: z.string().min(2, 'Минимум 2 символа'),
});

export const loginSchema = z.object({
  email: russianEmailSchema,
  password: z.string().min(1, 'Введите пароль'),
});

export const forgotPasswordSchema = z.object({
  email: russianEmailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Отсутствует токен'),
  newPassword: z.string().min(8, 'Минимум 8 символов'),
});

export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Минимум 8 символов'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
