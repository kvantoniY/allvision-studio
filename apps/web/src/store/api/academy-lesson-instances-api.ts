import { createApi } from '@reduxjs/toolkit/query/react';
import type { AcademyScene } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export type PublishedTemplateOption = {
  templateId: string;
  title: string;
  versionId: string;
  version: number;
  topicId: string | null;
  topicTitle: string | null;
  matchesLessonTopic: boolean;
};

export type LessonInstanceSummary = {
  id: string;
  title: string;
  version: number;
  overrides: { hiddenElementIds?: string[] };
};

export type LessonInstanceByLesson = {
  instance: LessonInstanceSummary | null;
  viewerRole: 'teacher' | 'student';
  lessonStatus: string;
  meetingUrl: string | null;
};

export type FullSceneGenerationStatus = {
  sceneId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  childAssetId: string | null;
};

/** Статус сцены урока в панели генераций преподавателя. */
export type SceneGenerationStatus =
  | 'NOT_NEEDED' // послойная сцена из готовых материалов
  | 'BLOCKED' // нужен AI-персонаж ребёнка
  | 'NOT_STARTED'
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type SceneGenerationItem = {
  sceneId: string;
  index: number;
  title: string;
  mode: 'layered' | 'full-ai';
  needsGeneration: boolean;
  prompt: string | null;
  status: SceneGenerationStatus;
  previewUrl: string | null;
};

export type SceneGenerationsReport = {
  hasCharacter: boolean;
  scenes: SceneGenerationItem[];
  total: number;
  ready: number;
  running: number;
  failed: number;
};

export const academyLessonInstancesApi = createApi({
  reducerPath: 'academyLessonInstancesApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/lesson-instances'),
  tagTypes: ['Instance', 'InstanceScenes', 'InstanceGenerations'],
  endpoints: (build) => ({
    getPublishedTemplates: build.query<{ items: PublishedTemplateOption[]; lessonTopicId: string | null }, { lessonId?: string } | void>({
      query: (arg) => ({ url: arg?.lessonId ? `/published-templates?lessonId=${arg.lessonId}` : '/published-templates' }),
    }),
    getInstanceByLesson: build.query<LessonInstanceByLesson, string>({
      query: (lessonId) => ({ url: `/by-lesson/${lessonId}` }),
      providesTags: (_r, _e, lessonId) => [{ type: 'Instance', id: lessonId }],
    }),
    createInstance: build.mutation<{ instanceId: string }, { lessonId: string; templateVersionId: string; overrides?: { hiddenElementIds?: string[] } }>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: (result, _e, { lessonId }) => [
        { type: 'Instance', id: lessonId },
        ...(result ? [{ type: 'InstanceScenes' as const, id: result.instanceId }] : []),
      ],
    }),
    getInstanceScene: build.query<{ scene: AcademyScene; hasCharacter: boolean }, string>({
      query: (id) => ({ url: `/${id}/scene` }),
    }),
    getInstanceScenes: build.query<{
      scenes: AcademyScene[];
      hasCharacter: boolean;
      sceneStatuses: FullSceneGenerationStatus[];
    }, string>({
      query: (id) => ({ url: `/${id}/scenes` }),
      providesTags: (_r, _e, id) => [{ type: 'InstanceScenes', id }],
    }),
    getInstanceGenerations: build.query<SceneGenerationsReport, string>({
      query: (id) => ({ url: `/${id}/generations` }),
      providesTags: (_r, _e, id) => [{ type: 'InstanceGenerations', id }],
    }),
    regenerateScene: build.mutation<{ ok: true }, { instanceId: string; sceneId: string }>({
      query: ({ instanceId, sceneId }) => ({ url: `/${instanceId}/generations/${sceneId}/regenerate`, method: 'POST' }),
      invalidatesTags: (_r, _e, { instanceId }) => [
        { type: 'InstanceGenerations', id: instanceId },
        { type: 'InstanceScenes', id: instanceId },
      ],
    }),
  }),
});

export const {
  useGetPublishedTemplatesQuery,
  useGetInstanceByLessonQuery,
  useCreateInstanceMutation,
  useLazyGetInstanceSceneQuery,
  useGetInstanceScenesQuery,
  useGetInstanceGenerationsQuery,
  useRegenerateSceneMutation,
} = academyLessonInstancesApi;
