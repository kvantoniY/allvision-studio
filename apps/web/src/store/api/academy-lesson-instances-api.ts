import { createApi } from '@reduxjs/toolkit/query/react';
import type { AcademyScene } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type PublishedTemplateOption = {
  templateId: string;
  title: string;
  versionId: string;
  version: number;
};

export type LessonInstanceSummary = {
  id: string;
  title: string;
  version: number;
  overrides: { hiddenElementIds?: string[] };
};

export const academyLessonInstancesApi = createApi({
  reducerPath: 'academyLessonInstancesApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/lesson-instances'),
  tagTypes: ['Instance'],
  endpoints: (build) => ({
    getPublishedTemplates: build.query<{ items: PublishedTemplateOption[] }, void>({
      query: () => ({ url: '/published-templates' }),
    }),
    getInstanceByLesson: build.query<{ instance: LessonInstanceSummary | null }, string>({
      query: (lessonId) => ({ url: `/by-lesson/${lessonId}` }),
      providesTags: (_r, _e, lessonId) => [{ type: 'Instance', id: lessonId }],
    }),
    createInstance: build.mutation<{ instanceId: string }, { lessonId: string; templateVersionId: string; overrides?: { hiddenElementIds?: string[] } }>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: (_r, _e, { lessonId }) => [{ type: 'Instance', id: lessonId }],
    }),
    getInstanceScene: build.query<{ scene: AcademyScene; hasCharacter: boolean }, string>({
      query: (id) => ({ url: `/${id}/scene` }),
    }),
  }),
});

export const {
  useGetPublishedTemplatesQuery,
  useGetInstanceByLessonQuery,
  useCreateInstanceMutation,
  useLazyGetInstanceSceneQuery,
} = academyLessonInstancesApi;
