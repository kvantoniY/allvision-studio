import { z } from 'zod';
const MessengerType = {
  TELEGRAM: 'TELEGRAM',
  WHATSAPP: 'WHATSAPP',
  VK: 'VK',
  PHONE: 'PHONE',
} as const;

export const updateProfileSchema = z.object({
  name: z.string().min(2, 'Минимум 2 символа').max(100, 'Максимум 100 символов').optional(),
  avatar: z.string().url('Некорректный URL').nullable().optional(),
  messenger: z.string().max(200).nullable().optional(),
  messengerType: z.nativeEnum(MessengerType).nullable().optional(),
});

export const changeAccountPasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Введите текущий пароль'),
  newPassword: z.string().min(8, 'Минимум 8 символов'),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Введите пароль'),
  confirmation: z.literal('УДАЛИТЬ', {
    errorMap: () => ({ message: 'Введите слово УДАЛИТЬ для подтверждения' }),
  }),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangeAccountPasswordInput = z.infer<typeof changeAccountPasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
