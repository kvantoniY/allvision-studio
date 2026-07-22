import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  LessonReportDto,
  LessonReportInput,
  ThreadDto,
  ThreadMessageDto,
} from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { academyBookingApi } from './academy-booking-api';

export const academyOperationsApi = createApi({
  reducerPath: 'academyOperationsApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/operations'),
  tagTypes: ['Report', 'Thread', 'ThreadMessages'],
  refetchOnFocus: true,
  endpoints: (build) => ({
    listLessonReports: build.query<{ reports: LessonReportDto[] }, string | void>({
      query: (childId) => ({ url: childId ? `/reports?childId=${encodeURIComponent(childId)}` : '/reports' }),
      providesTags: (result) => ['Report', ...(result?.reports.map((report) => ({ type: 'Report' as const, id: report.id })) ?? [])],
    }),
    markReportRead: build.mutation<{ ok: true }, string>({
      query: (reportId) => ({ url: `/reports/${reportId}/read`, method: 'POST' }),
      invalidatesTags: (_result, _error, reportId) => ['Report', { type: 'Report', id: reportId }],
    }),
    getTeacherLessonReport: build.query<{ report: LessonReportDto | null }, string>({
      query: (lessonId) => ({ url: `/teacher/lessons/${lessonId}/report` }),
      providesTags: (_result, _error, lessonId) => [{ type: 'Report', id: `lesson-${lessonId}` }],
    }),
    saveTeacherLessonReport: build.mutation<{ report: LessonReportDto }, { lessonId: string; body: LessonReportInput }>({
      query: ({ lessonId, body }) => ({ url: `/teacher/lessons/${lessonId}/report`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { lessonId }) => ['Report', { type: 'Report', id: `lesson-${lessonId}` }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(academyBookingApi.util.invalidateTags(['Lessons']));
        } catch {
          // Ошибка показывается вызывающим компонентом.
        }
      },
    }),
    listThreads: build.query<{ threads: ThreadDto[] }, void>({
      query: () => ({ url: '/threads' }),
      providesTags: (result) => ['Thread', ...(result?.threads.map((thread) => ({ type: 'Thread' as const, id: thread.id })) ?? [])],
    }),
    listThreadMessages: build.query<{ messages: ThreadMessageDto[] }, string>({
      query: (threadId) => ({ url: `/threads/${threadId}/messages` }),
      providesTags: (_result, _error, threadId) => [{ type: 'ThreadMessages', id: threadId }],
    }),
    sendThreadMessage: build.mutation<{ message: ThreadMessageDto }, { threadId: string; form: FormData }>({
      query: ({ threadId, form }) => ({ url: `/threads/${threadId}/messages`, method: 'POST', body: form }),
      invalidatesTags: (_result, _error, { threadId }) => ['Thread', { type: 'ThreadMessages', id: threadId }],
    }),
  }),
});

export const {
  useListLessonReportsQuery,
  useMarkReportReadMutation,
  useGetTeacherLessonReportQuery,
  useSaveTeacherLessonReportMutation,
  useListThreadsQuery,
  useListThreadMessagesQuery,
  useSendThreadMessageMutation,
} = academyOperationsApi;
