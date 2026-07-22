import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  AvailableTeacherDto,
  LessonBalanceDto,
  LessonDto,
  LessonPackageOption,
  TeacherSlotDto,
} from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type PaymentCreateResult = {
  payment: { id: string; amountRub: number };
  confirmationUrl: string;
};

export type TeacherEarningSummary = { status: string; amountRub: number; count: number };

export const academyBookingApi = createApi({
  reducerPath: 'academyBookingApi',
  baseQuery: createBaseQueryWithReauth('/api/academy'),
  tagTypes: ['Balance', 'Lessons', 'Teachers', 'Slots', 'Earnings'],
  refetchOnFocus: true,
  endpoints: (build) => ({
    getPackages: build.query<{ packages: LessonPackageOption[] }, void>({
      query: () => ({ url: '/packages' }),
    }),
    purchasePackage: build.mutation<PaymentCreateResult, { durationMin: 25 | 45; count: number }>({
      query: (body) => ({ url: '/packages/purchase', method: 'POST', body }),
    }),
    getBalance: build.query<{ balance: LessonBalanceDto[] }, void>({
      query: () => ({ url: '/balance' }),
      providesTags: ['Balance'],
    }),
    getTeachers: build.query<{ teachers: AvailableTeacherDto[] }, string | void>({
      query: (subject) => ({ url: subject ? `/teachers?subject=${subject}` : '/teachers' }),
      providesTags: ['Teachers'],
    }),
    bookLesson: build.mutation<{ lessonId: string }, { childId: string; slotId: string; topicId?: string }>({
      query: (body) => ({ url: '/booking', method: 'POST', body }),
      invalidatesTags: ['Balance', 'Lessons', 'Teachers'],
    }),
    getLessons: build.query<{ lessons: LessonDto[] }, void>({
      query: () => ({ url: '/lessons' }),
      providesTags: ['Lessons'],
    }),
    cancelLesson: build.mutation<{ ok: true; refunded: boolean }, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/lessons/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Balance', 'Lessons', 'Teachers'],
    }),
    // Teacher
    getTeacherSlots: build.query<{ slots: TeacherSlotDto[] }, void>({
      query: () => ({ url: '/teacher/slots' }),
      providesTags: ['Slots'],
    }),
    createSlot: build.mutation<{ slot: TeacherSlotDto }, { startsAt: string; durationMin: 25 | 45 }>({
      query: (body) => ({ url: '/teacher/slots', method: 'POST', body }),
      invalidatesTags: ['Slots'],
    }),
    // Сетка расписания: дни × время × повтор по неделям одним запросом.
    createSlotsBulk: build.mutation<{ created: number; skipped: number }, { startsAt: string[]; durationMin: 25 | 45 }>({
      query: (body) => ({ url: '/teacher/slots/bulk', method: 'POST', body }),
      invalidatesTags: ['Slots'],
    }),
    deleteSlot: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/teacher/slots/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Slots'],
    }),
    getTeacherLessons: build.query<{ lessons: LessonDto[] }, void>({
      query: () => ({ url: '/teacher/lessons' }),
      providesTags: ['Lessons'],
    }),
    setLessonStatus: build.mutation<{ ok: true }, { id: string; status: string }>({
      query: ({ id, status }) => ({ url: `/teacher/lessons/${id}/status`, method: 'POST', body: { status } }),
      invalidatesTags: ['Lessons', 'Earnings'],
    }),
    getTeacherEarnings: build.query<{ earnings: TeacherEarningSummary[] }, void>({
      query: () => ({ url: '/teacher/earnings' }),
      providesTags: ['Earnings'],
    }),
  }),
});

export const {
  useGetPackagesQuery,
  usePurchasePackageMutation,
  useGetBalanceQuery,
  useGetTeachersQuery,
  useBookLessonMutation,
  useGetLessonsQuery,
  useCancelLessonMutation,
  useGetTeacherSlotsQuery,
  useCreateSlotMutation,
  useCreateSlotsBulkMutation,
  useDeleteSlotMutation,
  useGetTeacherLessonsQuery,
  useSetLessonStatusMutation,
  useGetTeacherEarningsQuery,
} = academyBookingApi;
