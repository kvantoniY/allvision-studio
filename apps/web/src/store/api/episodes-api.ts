import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { Character, Episode, EpisodeStatus, ScenarioTemplate, Scene } from '@allvision/shared';
import { accountApi } from './account-api';

export type EpisodeCharacterLink = {
  episodeId: string;
  characterId: string;
  role: string | null;
  character: Character;
};

export type EpisodeWithRelations = Episode & {
  template: ScenarioTemplate | null;
  scene: Scene | null;
  characters: EpisodeCharacterLink[];
};

export type EpisodeListItem = Episode & {
  template: Pick<ScenarioTemplate, 'id' | 'slug' | 'title' | 'category'> | null;
  characters: Array<{
    episodeId: string;
    characterId: string;
    role: string | null;
    character: Pick<Character, 'id' | 'name' | 'type' | 'referenceImages' | 'primaryImageId' | 'status'>;
  }>;
};

export type EpisodesQuery = {
  page?: number;
  limit?: number;
  status?: EpisodeStatus;
  templateId?: string;
};

export type EpisodesResponse = {
  items: EpisodeListItem[];
  total: number;
  page: number;
  limit: number;
};

export type EpisodeStatusResponse = Pick<
  Episode,
  'id' | 'status' | 'progress' | 'resultImage' | 'resultVideo' | 'resultThumbnail' | 'errorMessage' | 'completedAt' | 'watermarkRemoved'
>;

export type CreateEpisodeInput = {
  templateId: string;
  characterIds: string[];
  sceneId?: string;
  customScenario?: string;
  durationSeconds?: number;
  style?: string;
  aspectRatio?: string;
};

export const episodesApi = createApi({
  reducerPath: 'episodesApi',
  baseQuery: createBaseQueryWithReauth('/api/episodes'),
  tagTypes: ['Episode'],
  endpoints: (build) => ({
    listEpisodes: build.query<EpisodesResponse, EpisodesQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 12));
        if (q?.status) params.set('status', q.status);
        if (q?.templateId) params.set('templateId', q.templateId);
        return { url: `/?${params.toString()}` };
      },
      providesTags: (result) => [
        'Episode',
        ...(result?.items.map((episode) => ({ type: 'Episode' as const, id: episode.id })) ?? []),
      ],
    }),
    getEpisode: build.query<{ episode: EpisodeWithRelations }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Episode', id }],
    }),
    getEpisodeStatus: build.query<EpisodeStatusResponse, string>({
      query: (id) => ({ url: `/${id}/status` }),
      providesTags: (_result, _error, id) => [{ type: 'Episode', id }],
    }),
    createEpisode: build.mutation<{ episode: EpisodeWithRelations }, CreateEpisodeInput>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['Episode'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Dashboard', 'Transactions']));
      },
    }),
    regenerateEpisode: build.mutation<{ episode: EpisodeWithRelations }, string>({
      query: (id) => ({ url: `/${id}/regenerate`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['Episode', { type: 'Episode', id }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Dashboard', 'Transactions']));
      },
    }),
    removeEpisodeWatermark: build.mutation<{ episode: EpisodeWithRelations }, string>({
      query: (id) => ({ url: `/${id}/remove-watermark`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => ['Episode', { type: 'Episode', id }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Dashboard', 'Transactions']));
      },
    }),
    deleteEpisode: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Episode'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Dashboard']));
      },
    }),
  }),
});

export const {
  useListEpisodesQuery,
  useGetEpisodeQuery,
  useGetEpisodeStatusQuery,
  useCreateEpisodeMutation,
  useRegenerateEpisodeMutation,
  useRemoveEpisodeWatermarkMutation,
  useDeleteEpisodeMutation,
} = episodesApi;
