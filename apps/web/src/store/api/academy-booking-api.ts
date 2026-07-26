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

export type TeacherStudent = {
  childId: string;
  name: string;
  lastLessonAt: string;
  lastStatus: string;
  total: number;
  completed: number;
  note: string | null;
};

export type ChildLessonHistoryItem = {
  id: string;
  startsAt: string;
  durationMin: number;
  status: string;
  topicTitle: string | null;
  teacherName: string;
  hasReport: boolean;
};

export type TeacherStudentDetail = {
  childId: string;
  name: string;
  birthDate: string | null;
  progress: { enrollments: Array<{ enrollmentId: string; courseTitle: string; subjectTitle: string; totalTopics: number; completedTopics: number; nextTopicId: string | null; topics: Array<{ topicId: string; title: string; status: string; completedAt: string | null; isNextRecommended: boolean }> }>; skills: Array<{ skillId: string; title: string; level: number; levelLabel: string }> };
  history: ChildLessonHistoryItem[];
  note: string | null;
  noteUpdatedAt: string | null;
};

export const academyBookingApi = createApi({
  reducerPath: 'academyBookingApi',
  baseQuery: createBaseQueryWithReauth('/api/academy'),
  tagTypes: ['Balance', 'Lessons', 'Teachers', 'Slots', 'Earnings', 'Students', 'Lab'],
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
    getTeacherProfile: build.query<{ teacherId: string; name: string; bio: string | null; photoUrl: string | null; lessonsCount: number; subjects: string[] }, string>({
      query: (teacherId) => ({ url: `/teachers/${teacherId}/profile` }),
    }),
    getLessons: build.query<{ lessons: LessonDto[] }, void>({
      query: () => ({ url: '/lessons' }),
      providesTags: ['Lessons'],
    }),
    cancelLesson: build.mutation<{ ok: true; refunded: boolean }, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/lessons/${id}/cancel`, method: 'POST', body: { reason } }),
      invalidatesTags: ['Balance', 'Lessons', 'Teachers'],
    }),
    rescheduleLesson: build.mutation<{ ok: true; startsAt: string }, { id: string; startsAt: string }>({
      query: ({ id, startsAt }) => ({ url: `/lessons/${id}/reschedule`, method: 'POST', body: { startsAt } }),
      invalidatesTags: ['Lessons', 'Slots', 'Teachers'],
    }),
    setMeetingLink: build.mutation<{ ok: true; meetingUrl: string | null }, { id: string; url: string }>({
      query: ({ id, url }) => ({ url: `/lessons/${id}/meeting-link`, method: 'POST', body: { url } }),
      invalidatesTags: ['Lessons'],
    }),
    getLessonChildOverview: build.query<{ name: string; avatar: string | null; streakCount: number; level: number; xp: number; xpIntoLevel: number; xpNeeded: number; percent: number; achievements: Array<{ title: string; icon: string }> }, string>({
      query: (lessonId) => ({ url: `/lessons/${lessonId}/child-overview` }),
    }),
    getLessonLab: build.query<{ hasLab: boolean; granted: number | null; spent: number; remaining: number; videoAllowed: boolean }, string>({
      query: (lessonId) => ({ url: `/lessons/${lessonId}/lab` }),
      providesTags: (_r, _e, lessonId) => [{ type: 'Lab', id: lessonId }],
    }),
    getLessonLabHistory: build.query<{ items: Array<{ id: string; status: string; progress: number; resultUrl: string | null; isVideo: boolean; prompt: string | null; createdAt: string }> }, string>({
      query: (lessonId) => ({ url: `/lessons/${lessonId}/lab/history` }),
      providesTags: (_r, _e, lessonId) => [{ type: 'Lab', id: `${lessonId}:history` }],
    }),
    generateLessonLab: build.mutation<{ generation: unknown; lab: { remaining: number; spent: number; granted: number | null } }, { lessonId: string; body: Record<string, unknown> }>({
      query: ({ lessonId, body }) => ({ url: `/lessons/${lessonId}/lab/generate`, method: 'POST', body }),
      invalidatesTags: (_r, _e, { lessonId }) => [{ type: 'Lab', id: lessonId }, { type: 'Lab', id: `${lessonId}:history` }],
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
    getTeacherStudents: build.query<{ students: TeacherStudent[] }, void>({
      query: () => ({ url: '/teacher/students' }),
      providesTags: ['Students'],
    }),
    getTeacherStudentDetail: build.query<TeacherStudentDetail, string>({
      query: (childId) => ({ url: `/teacher/students/${childId}` }),
      providesTags: (_r, _e, childId) => [{ type: 'Students', id: childId }],
    }),
    saveTeacherStudentNote: build.mutation<{ ok: true }, { childId: string; note: string }>({
      query: ({ childId, note }) => ({ url: `/teacher/students/${childId}/note`, method: 'PUT', body: { note } }),
      invalidatesTags: (_r, _e, { childId }) => ['Students', { type: 'Students', id: childId }],
    }),
  }),
});

export const {
  useGetPackagesQuery,
  usePurchasePackageMutation,
  useGetBalanceQuery,
  useGetTeachersQuery,
  useGetTeacherProfileQuery,
  useBookLessonMutation,
  useGetLessonsQuery,
  useCancelLessonMutation,
  useRescheduleLessonMutation,
  useSetMeetingLinkMutation,
  useGetTeacherSlotsQuery,
  useCreateSlotMutation,
  useCreateSlotsBulkMutation,
  useDeleteSlotMutation,
  useGetTeacherLessonsQuery,
  useSetLessonStatusMutation,
  useGetTeacherEarningsQuery,
  useGetTeacherStudentsQuery,
  useGetTeacherStudentDetailQuery,
  useSaveTeacherStudentNoteMutation,
  useGetLessonLabQuery,
  useGetLessonLabHistoryQuery,
  useGenerateLessonLabMutation,
  useGetLessonChildOverviewQuery,
} = academyBookingApi;
