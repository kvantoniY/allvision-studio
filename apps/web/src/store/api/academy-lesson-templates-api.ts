import { createApi } from '@reduxjs/toolkit/query/react';
import type { AcademyScene } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type LessonTemplateListItem = {
  id: string;
  title: string;
  status: string;
  topicId: string | null;
  updatedAt: string;
};

export type LessonTemplateFull = LessonTemplateListItem & { scene: AcademyScene };

export const academyLessonTemplatesApi = createApi({
  reducerPath: 'academyLessonTemplatesApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/lesson-templates'),
  tagTypes: ['Template'],
  endpoints: (build) => ({
    listTemplates: build.query<{ items: LessonTemplateListItem[] }, void>({
      query: () => ({ url: '/' }),
      providesTags: ['Template'],
    }),
    getTemplate: build.query<{ template: LessonTemplateFull }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_r, _e, id) => [{ type: 'Template', id }],
    }),
    createTemplate: build.mutation<{ template: LessonTemplateFull }, { title: string; topicId?: string | null }>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['Template'],
    }),
    updateTemplate: build.mutation<
      { template: LessonTemplateFull },
      { id: string; body: { title?: string; status?: string; topicId?: string | null; scene?: unknown } }
    >({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Template', id }, 'Template'],
    }),
    deleteTemplate: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Template'],
    }),
  }),
});

export const {
  useListTemplatesQuery,
  useGetTemplateQuery,
  useCreateTemplateMutation,
  useUpdateTemplateMutation,
  useDeleteTemplateMutation,
} = academyLessonTemplatesApi;
