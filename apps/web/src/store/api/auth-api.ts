import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { User } from '@allvision/shared';
import type {
  LoginInput,
  RegisterInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '@allvision/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export type SafeUser = Omit<User, 'passwordHash' | 'passwordResetToken' | 'passwordResetExpiresAt'>;

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${API_URL}/api/auth`,
    credentials: 'include',
  }),
  tagTypes: ['Me'],
  endpoints: (build) => ({
    register: build.mutation<{ user: SafeUser }, RegisterInput>({
      query: (body) => ({ url: '/register', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    login: build.mutation<{ user: SafeUser }, LoginInput>({
      query: (body) => ({ url: '/login', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    logout: build.mutation<{ ok: true }, void>({
      query: () => ({ url: '/logout', method: 'POST' }),
      invalidatesTags: ['Me'],
    }),
    getMe: build.query<{ user: SafeUser }, void>({
      query: () => ({ url: '/me' }),
      providesTags: ['Me'],
    }),
    forgotPassword: build.mutation<{ ok: true }, ForgotPasswordInput>({
      query: (body) => ({ url: '/forgot-password', method: 'POST', body }),
    }),
    resetPassword: build.mutation<{ ok: true }, ResetPasswordInput>({
      query: (body) => ({ url: '/reset-password', method: 'POST', body }),
    }),
  }),
});

export const {
  useRegisterMutation,
  useLoginMutation,
  useLogoutMutation,
  useGetMeQuery,
  useForgotPasswordMutation,
  useResetPasswordMutation,
} = authApi;
