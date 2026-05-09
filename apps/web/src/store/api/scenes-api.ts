import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Scene } from '@allvision/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:4000');

export type ScenesResponse = {
  items: Scene[];
};

export type UpdateSceneArg = {
  id: string;
  body: Partial<Pick<Scene, 'name' | 'description' | 'category' | 'isActive'>>;
};

export const scenesApi = createApi({
  reducerPath: 'scenesApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/scenes`,
    credentials: 'include',
  }),
  tagTypes: ['Scene'],
  endpoints: (build) => ({
    listScenes: build.query<ScenesResponse, void>({
      query: () => ({ url: '/' }),
      providesTags: (result) => [
        'Scene',
        ...(result?.items.map((scene) => ({ type: 'Scene' as const, id: scene.id })) ?? []),
      ],
    }),
    getScene: build.query<{ scene: Scene }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Scene', id }],
    }),
    createScene: build.mutation<{ scene: Scene }, FormData>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['Scene'],
    }),
    updateScene: build.mutation<{ scene: Scene }, UpdateSceneArg>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['Scene', { type: 'Scene', id }],
    }),
    deleteScene: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Scene'],
    }),
  }),
});

export const {
  useListScenesQuery,
  useGetSceneQuery,
  useCreateSceneMutation,
  useUpdateSceneMutation,
  useDeleteSceneMutation,
} = scenesApi;
