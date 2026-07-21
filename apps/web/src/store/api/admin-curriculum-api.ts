import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

export type CurriculumTopic = {
  id: string;
  title: string;
  goal: string | null;
  durationMin: number;
  difficulty: number;
  sortOrder: number;
  isActive: boolean;
  content: Record<string, unknown> | null;
  aiBudgetUsd: number;
  skills: { skillId: string }[];
};

export type CurriculumModule = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  topics: CurriculumTopic[];
};

export type CurriculumCourse = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  level: string | null;
  ageMin: number | null;
  ageMax: number | null;
  sortOrder: number;
  isActive: boolean;
  modules: CurriculumModule[];
};

export type CurriculumSubject = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  iconName: string | null;
  sortOrder: number;
  isActive: boolean;
  courses: CurriculumCourse[];
};

export type CurriculumSkill = {
  id: string;
  subjectId: string;
  slug: string;
  title: string;
  description: string | null;
};

export type CurriculumTree = {
  subjects: CurriculumSubject[];
  skills: CurriculumSkill[];
};

export const adminCurriculumApi = createApi({
  reducerPath: 'adminCurriculumApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/curriculum'),
  tagTypes: ['Curriculum'],
  endpoints: (build) => ({
    getCurriculum: build.query<CurriculumTree, void>({
      query: () => ({ url: '/' }),
      providesTags: ['Curriculum'],
    }),
    // Subjects
    createSubject: build.mutation<CurriculumSubject, Record<string, unknown>>({
      query: (body) => ({ url: '/subjects', method: 'POST', body }),
      invalidatesTags: ['Curriculum'],
    }),
    updateSubject: build.mutation<CurriculumSubject, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/subjects/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Curriculum'],
    }),
    deleteSubject: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/subjects/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Curriculum'],
    }),
    // Courses
    createCourse: build.mutation<CurriculumCourse, Record<string, unknown>>({
      query: (body) => ({ url: '/courses', method: 'POST', body }),
      invalidatesTags: ['Curriculum'],
    }),
    updateCourse: build.mutation<CurriculumCourse, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/courses/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Curriculum'],
    }),
    deleteCourse: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/courses/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Curriculum'],
    }),
    // Modules
    createModule: build.mutation<CurriculumModule, Record<string, unknown>>({
      query: (body) => ({ url: '/modules', method: 'POST', body }),
      invalidatesTags: ['Curriculum'],
    }),
    updateModule: build.mutation<CurriculumModule, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/modules/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Curriculum'],
    }),
    deleteModule: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/modules/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Curriculum'],
    }),
    // Topics
    createTopic: build.mutation<CurriculumTopic, Record<string, unknown>>({
      query: (body) => ({ url: '/topics', method: 'POST', body }),
      invalidatesTags: ['Curriculum'],
    }),
    updateTopic: build.mutation<CurriculumTopic, { id: string; body: Record<string, unknown> }>({
      query: ({ id, body }) => ({ url: `/topics/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['Curriculum'],
    }),
    deleteTopic: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/topics/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Curriculum'],
    }),
    // Skills
    createSkill: build.mutation<CurriculumSkill, Record<string, unknown>>({
      query: (body) => ({ url: '/skills', method: 'POST', body }),
      invalidatesTags: ['Curriculum'],
    }),
    deleteSkill: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/skills/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Curriculum'],
    }),
  }),
});

export const {
  useGetCurriculumQuery,
  useCreateSubjectMutation,
  useUpdateSubjectMutation,
  useDeleteSubjectMutation,
  useCreateCourseMutation,
  useUpdateCourseMutation,
  useDeleteCourseMutation,
  useCreateModuleMutation,
  useUpdateModuleMutation,
  useDeleteModuleMutation,
  useCreateTopicMutation,
  useUpdateTopicMutation,
  useDeleteTopicMutation,
  useCreateSkillMutation,
  useDeleteSkillMutation,
} = adminCurriculumApi;
