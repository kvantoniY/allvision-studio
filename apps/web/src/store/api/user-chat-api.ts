import { createApi } from '@reduxjs/toolkit/query/react';
import type { ChatModelOption, ModelPriceOverrides, ProjectStatus } from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';
import { authApi } from './auth-api';
import { invalidateFailedProjectSideEffects, projectsApi } from './projects-api';

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
  expiresAt: string | null;
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
  aspectRatio?: '1:1' | '9:16' | '16:9' | '4:3' | '3:4' | '21:9' | '9:21' | 'auto';
  duration?: number;
  generateAudio?: boolean;
  params?: Record<string, unknown>;
  inputRef?: string;
  imageInputRef?: string;
  videoInputRef?: string;
  audioInputRef?: string;
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
    mediaKind: 'image' | 'video' | 'audio';
    dimensions?: { width: number; height: number };
  };
};

export type ChatModelsResponse = {
  models: ChatModelOption[];
  modelPriceOverrides: ModelPriceOverrides;
};

export const userChatApi = createApi({
  reducerPath: 'userChatApi',
  baseQuery: createBaseQueryWithReauth('/api/user'),
  // Возврат на вкладку / реконнект сразу подтягивают свежее состояние чата и результат
  // генерации, не дожидаясь следующего (затроттленного в фоне) тика поллинга.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  tagTypes: ['Chats', 'Chat', 'ChatModels'],
  endpoints: (build) => ({
    getChatModels: build.query<ChatModelsResponse, void>({
      query: () => ({ url: '/chat/models' }),
      providesTags: ['ChatModels'],
    }),
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
      async onQueryStarted(_id, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          invalidateFailedProjectSideEffects(dispatch, data.messages.map((message) => message.project));
        } catch {
          // query errors are handled by the caller
        }
      },
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
  useGetChatModelsQuery,
  useRenameChatMutation,
  useDeleteChatMutation,
  useCreateChatMessageMutation,
  useUploadChatInputMutation,
} = userChatApi;
