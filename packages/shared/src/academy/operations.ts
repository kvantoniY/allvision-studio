import { z } from 'zod';
import type { EarningStatusValue } from './booking';

export const LESSON_REPORT_TEXT_MAX = 4000;
export const THREAD_MESSAGE_TEXT_MAX = 2000;

export const lessonReportSchema = z.object({
  summary: z.string().trim().min(3).max(LESSON_REPORT_TEXT_MAX),
  successes: z.string().trim().min(3).max(LESSON_REPORT_TEXT_MAX),
  recommendation: z.string().trim().min(3).max(LESSON_REPORT_TEXT_MAX),
  resultAssetIds: z.array(z.string().min(1)).max(20).default([]),
});

export const threadMessageSchema = z.object({
  body: z.string().trim().max(THREAD_MESSAGE_TEXT_MAX).optional(),
});

export const payoutPeriodSchema = z.object({
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
}).refine((value) => value.periodStart <= value.periodEnd, {
  message: 'Начало периода должно быть раньше окончания',
  path: ['periodEnd'],
});

export const payoutRejectSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export type LessonReportInput = z.infer<typeof lessonReportSchema>;
export type PayoutPeriodInput = z.infer<typeof payoutPeriodSchema>;

export interface LessonReportDto {
  id: string;
  lessonId: string;
  childId: string;
  childName: string;
  teacherName: string;
  startsAt: string;
  summary: string;
  successes: string;
  recommendation: string;
  resultAssets: Array<{ id: string; title: string; fileUrl: string }>;
  parentReadAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ThreadMessageRoleValue = 'PARENT' | 'TEACHER' | 'ADMIN' | 'SYSTEM';

export interface ThreadMessageDto {
  id: string;
  role: ThreadMessageRoleValue;
  authorName: string;
  body: string | null;
  attachment: null | {
    fileName: string;
    mimeType: string;
    fileSize: number;
    fileUrl: string;
  };
  createdAt: string;
}

export interface ThreadDto {
  id: string;
  childId: string;
  childName: string;
  parentName: string;
  teacherName: string;
  updatedAt: string;
  lastMessage: ThreadMessageDto | null;
}

export interface TeacherPayoutDto {
  id: string;
  teacherId: string;
  teacherName: string;
  periodStart: string;
  periodEnd: string;
  amountRub: number;
  earningsCount: number;
  status: EarningStatusValue;
  confirmationFileName: string | null;
  confirmationFileUrl: string | null;
  rejectionReason: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface TeacherPayoutSummaryDto {
  teacherId: string;
  teacherName: string;
  pendingRub: number;
  availableRub: number;
  paidRub: number;
  rejectedRub: number;
  availableCount: number;
  payout: TeacherPayoutDto | null;
}

export type DeletionStatusValue = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface DeletionLogDto {
  id: string;
  scope: 'CHILD' | 'ACCOUNT';
  status: DeletionStatusValue;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}
