import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  CharacterProfileDto,
  ChildProgressDto,
  ChildPhotoDto,
  ChildProfileDto,
  ConsentTypeValue,
  DeletionLogDto,
} from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type FamilyCourseCatalog = {
  subjects: Array<{
    id: string;
    title: string;
    iconName: string | null;
    courses: Array<{ id: string; title: string; level: string | null; ageMin: number | null; ageMax: number | null; description: string | null }>;
  }>;
};

export const familyApi = createApi({
  reducerPath: 'familyApi',
  baseQuery: createBaseQueryWithReauth('/api/family'),
  tagTypes: ['Child', 'ChildPhotos', 'Character', 'Progress'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    listChildren: build.query<{ items: ChildProfileDto[] }, void>({
      query: () => ({ url: '/children' }),
      providesTags: (result) => [
        'Child',
        ...(result?.items.map((child) => ({ type: 'Child' as const, id: child.id })) ?? []),
      ],
    }),
    createChild: build.mutation<ChildProfileDto, { name: string; birthDate?: string; notes?: string }>({
      query: (body) => ({ url: '/children', method: 'POST', body }),
      invalidatesTags: ['Child'],
    }),
    updateChild: build.mutation<
      ChildProfileDto,
      { childId: string; body: { name?: string; birthDate?: string | null; notes?: string | null } }
    >({
      query: ({ childId, body }) => ({ url: `/children/${childId}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { childId }) => ['Child', { type: 'Child', id: childId }],
    }),
    deleteChild: build.mutation<{ ok: true; deletion: DeletionLogDto }, string>({
      query: (childId) => ({ url: `/children/${childId}`, method: 'DELETE' }),
      invalidatesTags: ['Child'],
    }),
    acceptConsents: build.mutation<ChildProfileDto, { childId: string; types: ConsentTypeValue[] }>({
      query: ({ childId, types }) => ({
        url: `/children/${childId}/consents`,
        method: 'POST',
        body: { types },
      }),
      invalidatesTags: (_r, _e, { childId }) => ['Child', { type: 'Child', id: childId }],
    }),
    revokeConsent: build.mutation<ChildProfileDto, { childId: string; type: ConsentTypeValue }>({
      query: ({ childId, type }) => ({
        url: `/children/${childId}/consents/${type}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { childId }) => ['Child', { type: 'Child', id: childId }],
    }),
    listChildPhotos: build.query<{ items: ChildPhotoDto[] }, string>({
      query: (childId) => ({ url: `/children/${childId}/photos` }),
      providesTags: (_r, _e, childId) => [{ type: 'ChildPhotos', id: childId }],
    }),
    uploadChildPhotos: build.mutation<{ items: ChildPhotoDto[] }, { childId: string; form: FormData }>({
      query: ({ childId, form }) => ({
        url: `/children/${childId}/photos`,
        method: 'POST',
        body: form,
      }),
      invalidatesTags: (_r, _e, { childId }) => [
        'Child',
        { type: 'Child', id: childId },
        { type: 'ChildPhotos', id: childId },
      ],
    }),
    deleteChildPhoto: build.mutation<{ ok: true }, { childId: string; photoId: string }>({
      query: ({ childId, photoId }) => ({
        url: `/children/${childId}/photos/${photoId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { childId }) => [
        'Child',
        { type: 'Child', id: childId },
        { type: 'ChildPhotos', id: childId },
      ],
    }),
    getCharacter: build.query<{ profile: CharacterProfileDto | null }, string>({
      query: (childId) => ({ url: `/children/${childId}/character` }),
      providesTags: (_r, _e, childId) => [{ type: 'Character', id: childId }],
    }),
    generateCharacter: build.mutation<{ profile: CharacterProfileDto }, string>({
      query: (childId) => ({ url: `/children/${childId}/character/generate`, method: 'POST' }),
      invalidatesTags: (_r, _e, childId) => [{ type: 'Character', id: childId }],
    }),
    approveCharacter: build.mutation<{ profile: CharacterProfileDto }, string>({
      query: (childId) => ({ url: `/children/${childId}/character/approve`, method: 'POST' }),
      invalidatesTags: (_r, _e, childId) => [{ type: 'Character', id: childId }],
    }),
    deleteCharacterRef: build.mutation<{ ok: true }, { childId: string; refId: string }>({
      query: ({ childId, refId }) => ({
        url: `/children/${childId}/character/references/${refId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { childId }) => [{ type: 'Character', id: childId }],
    }),
    regenerateCharacterRef: build.mutation<{ profile: CharacterProfileDto }, { childId: string; refId: string }>({
      query: ({ childId, refId }) => ({
        url: `/children/${childId}/character/references/${refId}/regenerate`,
        method: 'POST',
      }),
      invalidatesTags: (_r, _e, { childId }) => [{ type: 'Character', id: childId }],
    }),
    listCourses: build.query<FamilyCourseCatalog, void>({
      query: () => ({ url: '/courses' }),
    }),
    getChildProgress: build.query<{ progress: ChildProgressDto }, string>({
      query: (childId) => ({ url: `/children/${childId}/progress` }),
      providesTags: (_r, _e, childId) => [{ type: 'Progress', id: childId }],
    }),
    getChildLessons: build.query<{ lessons: Array<{ id: string; startsAt: string; durationMin: number; status: string; topicTitle: string | null; teacherName: string; hasReport: boolean }> }, string>({
      query: (childId) => ({ url: `/children/${childId}/lessons` }),
    }),
    enrollChild: build.mutation<{ enrollmentId: string }, { childId: string; courseId: string }>({
      query: ({ childId, courseId }) => ({ url: `/children/${childId}/enrollments`, method: 'POST', body: { courseId } }),
      invalidatesTags: (_r, _e, { childId }) => [{ type: 'Progress', id: childId }],
    }),
    unenrollChild: build.mutation<{ ok: true }, { childId: string; enrollmentId: string }>({
      query: ({ childId, enrollmentId }) => ({ url: `/children/${childId}/enrollments/${enrollmentId}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, { childId }) => [{ type: 'Progress', id: childId }],
    }),
  }),
});

export const {
  useListChildrenQuery,
  useCreateChildMutation,
  useUpdateChildMutation,
  useDeleteChildMutation,
  useAcceptConsentsMutation,
  useRevokeConsentMutation,
  useListChildPhotosQuery,
  useUploadChildPhotosMutation,
  useDeleteChildPhotoMutation,
  useGetCharacterQuery,
  useGenerateCharacterMutation,
  useApproveCharacterMutation,
  useDeleteCharacterRefMutation,
  useRegenerateCharacterRefMutation,
  useListCoursesQuery,
  useGetChildProgressQuery,
  useGetChildLessonsQuery,
  useEnrollChildMutation,
  useUnenrollChildMutation,
} = familyApi;
