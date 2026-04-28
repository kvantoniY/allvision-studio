import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Character, CharacterStatus, CharacterType } from '@allvision/shared';
import { accountApi } from './account-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type CharactersQuery = {
  status?: CharacterStatus;
  type?: CharacterType;
};

export type CharactersResponse = {
  items: Character[];
};

export type UpdateCharacterArg = {
  id: string;
  body: Partial<Pick<Character, 'name' | 'description' | 'gender' | 'ageGroup' | 'primaryImageId' | 'isActive'>>;
};

export const charactersApi = createApi({
  reducerPath: 'charactersApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/characters`,
    credentials: 'include',
  }),
  tagTypes: ['Character'],
  endpoints: (build) => ({
    listCharacters: build.query<CharactersResponse, CharactersQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.status) params.set('status', q.status);
        if (q?.type) params.set('type', q.type);
        const suffix = params.toString();
        return { url: suffix ? `/?${suffix}` : '/' };
      },
      providesTags: (result) => [
        'Character',
        ...(result?.items.map((character) => ({ type: 'Character' as const, id: character.id })) ?? []),
      ],
    }),
    getCharacter: build.query<{ character: Character }, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Character', id }],
    }),
    createCharacter: build.mutation<{ character: Character }, FormData>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['Character'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(accountApi.util.invalidateTags(['Dashboard']));
      },
    }),
    updateCharacter: build.mutation<{ character: Character }, UpdateCharacterArg>({
      query: ({ id, body }) => ({ url: `/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, { id }) => ['Character', { type: 'Character', id }],
    }),
    deleteCharacter: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Character'],
    }),
  }),
});

export const {
  useListCharactersQuery,
  useGetCharacterQuery,
  useCreateCharacterMutation,
  useUpdateCharacterMutation,
  useDeleteCharacterMutation,
} = charactersApi;
