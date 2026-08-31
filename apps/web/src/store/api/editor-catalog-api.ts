import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';

/**
 * Подборка услуг для панели ИИ в редакторе: категории задаёт владелец, состав — тоже.
 */
export type EditorServiceCategory = {
  id: string;
  title: string;
  serviceSlugs: string[];
};

export type EditorCatalogService = {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  description: string;
  previewImage: string | null;
  coverImage: string | null;
  previewVideo: string | null;
  previewMode: string;
  priceCoinsPro: number | null;
  priceCoinsStandard: number | null;
  priceTokens: number | null;
  userInputForm: unknown;
  isActive: boolean;
};

export type EditorPickerService = {
  id: string;
  slug: string;
  title: string;
  shortDesc: string;
  previewImage: string | null;
  coverImage: string | null;
  isActive: boolean;
  category: string;
};

export const editorCatalogApi = createApi({
  reducerPath: 'editorCatalogApi',
  baseQuery: createBaseQueryWithReauth('/api/user/editor-catalog'),
  tagTypes: ['EditorCatalog'],
  endpoints: (build) => ({
    getEditorCatalog: build.query<{ categories: EditorServiceCategory[]; services: EditorCatalogService[] }, void>({
      query: () => ({ url: '/' }),
      providesTags: ['EditorCatalog'],
    }),
    saveEditorCatalog: build.mutation<{ categories: EditorServiceCategory[] }, { categories: EditorServiceCategory[] }>({
      query: (body) => ({ url: '/', method: 'PUT', body }),
      invalidatesTags: ['EditorCatalog'],
    }),
    listAllServicesForPicker: build.query<{ services: EditorPickerService[] }, void>({
      query: () => ({ url: '/all-services' }),
    }),
  }),
});

export const {
  useGetEditorCatalogQuery,
  useSaveEditorCatalogMutation,
  useListAllServicesForPickerQuery,
} = editorCatalogApi;
