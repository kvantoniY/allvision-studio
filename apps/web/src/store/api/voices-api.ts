import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

/** Каталог голосов озвучки: проксируется нашим API, ключ сервиса на фронт не попадает. */
export type CatalogVoice = {
  voiceId: string;
  name: string;
  gender: string | null;
  language: string | null;
  accent: string | null;
  previewUrl: string | null;
  description: string | null;
  /** Насколько похож на присланный образец, в процентах. Есть только у поиска по записи. */
  similarity?: number | null;
};

export type VoicesQuery = {
  search?: string;
  gender?: 'male' | 'female';
  language?: string;
  page?: number;
  pageSize?: number;
};

export const voicesApi = createApi({
  reducerPath: 'voicesApi',
  baseQuery: createBaseQueryWithReauth('/api/user/voices'),
  endpoints: (build) => ({
    listVoices: build.query<{ voices: CatalogVoice[]; total: number; hasMore: boolean; page: number }, VoicesQuery | void>({
      query: (params) => {
        const search = new URLSearchParams();
        if (params?.search) search.set('search', params.search);
        if (params?.gender) search.set('gender', params.gender);
        if (params?.language) search.set('language', params.language);
        if (params?.page !== undefined) search.set('page', String(params.page));
        if (params?.pageSize) search.set('pageSize', String(params.pageSize));
        const qs = search.toString();
        return { url: qs ? `/?${qs}` : '/' };
      },
      // Каталог живёт долго — не дёргаем сервис на каждое открытие панели.
      keepUnusedDataFor: 600,
    }),
    searchVoiceBySample: build.mutation<{ exactMatch: boolean; truncated: boolean; voices: CatalogVoice[] }, File>({
      query: (file) => {
        const body = new FormData();
        body.append('file', file);
        return { url: '/search', method: 'POST', body };
      },
    }),
  }),
});

export const { useListVoicesQuery, useSearchVoiceBySampleMutation } = voicesApi;
