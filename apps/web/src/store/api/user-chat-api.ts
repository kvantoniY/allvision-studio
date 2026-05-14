import { createApi } from '@reduxjs/toolkit/query/react';
import type { ProjectStatus } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { authApi } from './auth-api';
import { projectsApi } from './projects-api';

export type ChatProjectState = {
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

export type ChatSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastResultPreview: string | null;
  lastStatus: ProjectStatus | null;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  createdAt: string;
  prompt: string;
  modelSlug: string;
  aspectRatio: string | null;
  duration: number | null;
  inputRef: string | null;
  projectId: string;
  project: ChatProjectState;
};

export type ChatDetails = {
  chat: ChatSummary & { deletedAt?: string | null };
  messages: ChatMessage[];
};

export type ChatsResponse = {
  items: ChatSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type ChatMessageBody = {
  modelSlug: string;
  prompt: string;
  aspectRatio?: '1:1' | '9:16' | '16:9' | 'auto';
  duration?: number;
  inputRef?: string;
};

export type CreateChatMessageResponse = {
  message: ChatMessage;
  projectId: string;
  status: 'queued';
  estimatedDurationSec: number;
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
  baseQuery: createBaseQueryWithReauth('/api/user'),
  tagTypes: ['Chats', 'Chat'],
  endpoints: (build) => ({
    listChats: build.query<ChatsResponse, { limit?: number; offset?: number } | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('limit', String(q?.limit ?? 50));
        params.set('offset', String(q?.offset ?? 0));
        return { url: `/chats?${params.toString()}` };
      },
      providesTags: ['Chats'],
    }),
    createChat: build.mutation<{ chat: ChatSummary }, { title?: string } | void>({
      query: (body) => ({ url: '/chats', method: 'POST', body: body ?? {} }),
      invalidatesTags: ['Chats'],
    }),
    getChat: build.query<ChatDetails, string>({
      query: (id) => ({ url: `/chats/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Chat', id }],
    }),
    renameChat: build.mutation<{ chat: ChatSummary }, { id: string; title: string }>({
      query: ({ id, title }) => ({ url: `/chats/${id}`, method: 'PATCH', body: { title } }),
      invalidatesTags: (_result, _error, { id }) => ['Chats', { type: 'Chat', id }],
    }),
    deleteChat: build.mutation<{ ok: true }, string>({
      query: (id) => ({ url: `/chats/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Chats'],
    }),
    createChatMessage: build.mutation<CreateChatMessageResponse, { chatId: string; body: ChatMessageBody }>({
      query: ({ chatId, body }) => ({ url: `/chats/${chatId}/messages`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { chatId }) => ['Chats', { type: 'Chat', id: chatId }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        dispatch(authApi.util.invalidateTags(['Me', 'User']));
        dispatch(projectsApi.util.invalidateTags(['Project']));
      },
    }),
    uploadChatInput: build.mutation<ChatUploadResponse, FormData>({
      query: (body) => ({ url: '/chat/upload', method: 'POST', body }),
    }),
  }),
});

export const {
  useListChatsQuery,
  useCreateChatMutation,
  useGetChatQuery,
  useRenameChatMutation,
  useDeleteChatMutation,
  useCreateChatMessageMutation,
  useUploadChatInputMutation,
} = userChatApi;
