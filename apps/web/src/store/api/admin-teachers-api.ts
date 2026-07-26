import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type AdminTeacherProfile = {
  userId: string;
  name: string;
  email: string;
  bio: string | null;
  photoUrl: string | null;
  lessonsManual: number | null;
  lessonsCompleted: number;
  courseIds: string[];
  isActive: boolean;
  courses: Array<{ id: string; title: string; subjectTitle: string }>;
};

export const adminTeachersApi = createApi({
  reducerPath: 'adminTeachersApi',
  baseQuery: createBaseQueryWithReauth('/api/admin/teachers'),
  tagTypes: ['Teacher'],
  endpoints: (build) => ({
    getAdminTeacher: build.query<AdminTeacherProfile, string>({
      query: (userId) => ({ url: `/${userId}` }),
      providesTags: (_r, _e, userId) => [{ type: 'Teacher', id: userId }],
    }),
    updateAdminTeacher: build.mutation<{ ok: true }, { userId: string; bio?: string | null; lessonsManual?: number | null; courseIds?: string[]; isActive?: boolean }>({
      query: ({ userId, ...body }) => ({ url: `/${userId}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Teacher', id: userId }],
    }),
    uploadTeacherPhoto: build.mutation<{ ok: true; photoUrl: string }, { userId: string; file: File }>({
      query: ({ userId, file }) => {
        const form = new FormData();
        form.append('file', file);
        return { url: `/${userId}/photo`, method: 'POST', body: form };
      },
      invalidatesTags: (_r, _e, { userId }) => [{ type: 'Teacher', id: userId }],
    }),
  }),
});

export const {
  useGetAdminTeacherQuery,
  useUpdateAdminTeacherMutation,
  useUploadTeacherPhotoMutation,
} = adminTeachersApi;
