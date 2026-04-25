import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().min(2, 'Введите имя'),
  email: z.string().email('Некорректный email'),
  subject: z.string().min(3, 'Укажите тему'),
  message: z.string().min(10, 'Сообщение должно быть подробнее'),
});

export type ContactInput = z.infer<typeof contactSchema>;
