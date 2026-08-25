import { z } from 'zod';

/**
 * Заявка с заглушки будущего раздела витрины (G1: «Альбомы»).
 * Тема ограничена списком, чтобы форма не превратилась в открытый приёмник спама.
 */
export const WAITLIST_TOPICS = ['albums'] as const;

export type WaitlistTopic = (typeof WAITLIST_TOPICS)[number];

export const waitlistLeadSchema = z.object({
  topic: z.enum(WAITLIST_TOPICS),
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(1000).optional(),
});

export type WaitlistLeadInput = z.infer<typeof waitlistLeadSchema>;
