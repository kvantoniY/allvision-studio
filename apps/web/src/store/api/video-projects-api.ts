import { createApi } from '@reduxjs/toolkit/query/react';
import type { Timeline } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { projectsApi } from './projects-api';

export type VideoProjectSummary = {
  id: string;
  title: string;
  timeline: Timeline;
  lastExportId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EditorMediaUpload = {
  url: string;
  mediaKind: 'image' | 'video' | 'audio';
  dimensions?: { width: number; height: number };
};

export const videoProjectsApi = createApi({
  reducerPath: 'videoProjectsApi',
  baseQuery: createBaseQueryWithReauth('/api/user/video-projects'),
  tagTypes: ['VideoProject'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: (build) => ({
    listVideoProjects: build.query<{ items: VideoProjectSummary[] }, void>({
      query: () => ({ url: '/' }),
      providesTags: ['VideoProject'],
    }),
    getVideoProject: build.query<{ project: VideoProjectSummary }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'VideoProject', id }],
    }),
    createVideoProject: build.mutation<{ project: VideoProjectSummary }, { title?: string; timeline?: Timeline } | void>({
      query: (body) => ({ url: '/', method: 'POST', body: body ?? {} }),
      invalidatesTags: ['VideoProject'],
    }),
    updateVideoProject: build.mutation<
      { project: VideoProjectSummary },
      { id: string; title?: string; timeline?: Timeline }
    >({
      query: ({ id, ...body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      // Список инвалидируем, чтобы поменявшееся название и порядок по дате не отставали;
      // саму карточку — нет, иначе автосохранение перетирало бы правки в редакторе ответом сервера.
      invalidatesTags: ['VideoProject'],
    }),
    createFromProject: build.mutation<{ project: VideoProjectSummary }, { projectId: string; title?: string }>({
      query: (body) => ({ url: '/from-project', method: 'POST', body }),
      invalidatesTags: ['VideoProject'],
    }),
    deleteVideoProject: build.mutation<void, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['VideoProject'],
    }),
    uploadEditorMedia: build.mutation<EditorMediaUpload, { id: string; file: File }>({
      query: ({ id, file }) => {
        const body = new FormData();
        body.append('file', file);
        return { url: `/${id}/media`, method: 'POST', body };
      },
    }),
    generateScene: build.mutation<
      { projectId: string; tokensCost: number; estimatedDurationSec: number },
      { id: string; sceneId: string; body: Record<string, unknown> }
    >({
      query: ({ id, sceneId, body }) => ({ url: `/${id}/scenes/${sceneId}/generate`, method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        // Генерация списывает коины и создаёт обычный Project — баланс и список должны это увидеть.
        dispatch(projectsApi.util.invalidateTags(['Project']));
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'VideoProject', id }],
    }),
    listVideoExports: build.query<{ items: Array<{ id: string; status: string; progress: number; resultVideo: string | null; resultThumbnail: string | null; errorCode: string | null; createdAt: string; completedAt: string | null }> }, string>({
      query: (id) => ({ url: `/${id}/exports` }),
      providesTags: (_r, _e, id) => [{ type: 'VideoProject', id: `exports-${id}` }],
    }),
    listVoiceovers: build.query<
      { items: Array<{ id: string; status: string; progress: number; url: string | null; text: string | null; errorCode: string | null; createdAt: string }> },
      string
    >({
      query: (id) => ({ url: `/${id}/voiceovers` }),
      providesTags: (_r, _e, id) => [{ type: 'VideoProject', id: `voiceovers-${id}` }],
    }),
    generateVoiceover: build.mutation<
      { projectId: string; tokensCost: number },
      { id: string; body: { text: string; model: string; emotion?: string; speed?: number } }
    >({
      query: ({ id, body }) => ({ url: `/${id}/voiceover/generate`, method: 'POST', body }),
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        // Озвучка списывает коины и создаёт обычный Project — баланс должен это увидеть.
        dispatch(projectsApi.util.invalidateTags(['Project']));
      },
      invalidatesTags: (_result, _error, { id }) => [{ type: 'VideoProject', id: `voiceovers-${id}` }],
    }),
    exportVideoProject: build.mutation<{ projectId: string; alreadyRunning?: boolean; tokensCost?: number }, string>({
      query: (id) => ({ url: `/${id}/export`, method: 'POST' }),
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        // Экспорт создаёт обычный Project, поэтому список генераций должен его увидеть.
        dispatch(projectsApi.util.invalidateTags(['Project']));
      },
      invalidatesTags: ['VideoProject'],
    }),
  }),
});

export const {
  useListVideoProjectsQuery,
  useGetVideoProjectQuery,
  useCreateVideoProjectMutation,
  useCreateFromProjectMutation,
  useUpdateVideoProjectMutation,
  useDeleteVideoProjectMutation,
  useUploadEditorMediaMutation,
  useExportVideoProjectMutation,
  useGenerateSceneMutation,
  useGenerateVoiceoverMutation,
  useListVideoExportsQuery,
  useListVoiceoversQuery,
} = videoProjectsApi;
