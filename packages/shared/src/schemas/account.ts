import { z } from 'zod';

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Minimum 2 characters').max(100, 'Maximum 100 characters').optional(),
});

export const changeAccountPasswordSchema = z.object({
  oldPassword: z.string().min(1, 'Enter current password'),
  newPassword: z.string().min(8, 'Minimum 8 characters'),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter password'),
  confirmation: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangeAccountPasswordInput = z.infer<typeof changeAccountPasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
