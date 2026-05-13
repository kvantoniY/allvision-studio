import { createApi } from '@reduxjs/toolkit/query/react';
import type { ProjectStatus } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { authApi } from './auth-api';
import { projectsApi } from './projects-api';

export type ChatHistoryItem = {
  id: string;
  title: string;
  status: ProjectStatus;
  progress: number;
  tokensCost: number;
  inputText: string | null;
  resultImage: string | null;
  resultVideo: string | null;
  resultThumbnail: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  userInputs: unknown;
  createdAt: string;
  completedAt: string | null;
  modelSlug: string | null;
  category: string | null;
  prompt: string;
  inputPreviewUrl: string | null;
  outputPreview: string | null;
};

export type ChatHistoryResponse = {
  items: ChatHistoryItem[];
  total: number;
  limit: number;
  offset: number;
};

export type ChatGenerateBody = {
  modelSlug: string;
  prompt: string;
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
  duration?: number;
  imageInputRef?: string;
  videoInputRef?: string;
};

export type ChatGenerateResponse = {
  projectId: string;
  status: 'queued';
  estimatedDurationSec: number;
  project: {
    id: string;
    status: string;
    progress: number;
    tokensCost: number;
    createdAt: string;
    serviceId: string | null;
    title: string;
  };
};

export type ChatUploadResponse = {
  input: {
    url: string;
    key: string;
    ref: string;
    mediaKind: 'image' | 'video';
    dimensions?: { width: number; height: number };
  };
};

export const userChatApi = createApi({
  reducerPath: 'userChatApi',
  baseQuery: createBaseQueryWithReauth('/api/user/chat'),
  tagTypes: ['ChatHistory'],
  endpoints: (build) => ({
    getChatHistory: build.query<ChatHistoryResponse, { limit?: number; offset?: number } | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('limit', String(q?.limit ?? 50));
        params.set('offset', String(q?.offset ?? 0));
        return { url: `/history?${params.toString()}` };
      },
      providesTags: ['ChatHistory'],
    }),
    uploadChatInput: build.mutation<ChatUploadResponse, FormData>({
      query: (body) => ({ url: '/upload', method: 'POST', body }),
    }),
    generateChat: build.mutation<ChatGenerateResponse, ChatGenerateBody>({
      query: (body) => ({ url: '/generate', method: 'POST', body }),
      invalidatesTags: ['ChatHistory'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(authApi.util.invalidateTags(['Me', 'User']));
        dispatch(projectsApi.util.invalidateTags(['Project']));
      },
    }),
  }),
});

export const {
  useGetChatHistoryQuery,
  useGenerateChatMutation,
  useUploadChatInputMutation,
} = userChatApi;
