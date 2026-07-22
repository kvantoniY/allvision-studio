import { createApi } from '@reduxjs/toolkit/query/react';
import type {
  KidProfileDto,
  TeacherRewardAssetDto,
  TeacherRewardCatalogItem,
  TeacherRewardGrantInput,
  TeacherXpGrantInput,
} from '@allvision/shared';
import { createBaseQueryWithReauth } from './base-query';

export const academyGamificationApi = createApi({
  reducerPath: 'academyGamificationApi',
  baseQuery: createBaseQueryWithReauth('/api/academy/gamification'),
  tagTypes: ['KidProfile', 'RewardCatalog'],
  refetchOnFocus: true,
  endpoints: (build) => ({
    getKidProfile: build.query<{ profile: KidProfileDto }, string>({
      query: (childId) => ({ url: `/kids/${childId}/profile` }),
      providesTags: (_result, _error, childId) => [{ type: 'KidProfile', id: childId }],
    }),
    equipKidReward: build.mutation<{ ok: true }, { childId: string; rewardId: string }>({
      query: ({ childId, rewardId }) => ({
        url: `/kids/${childId}/rewards/${rewardId}/equip`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, { childId }) => [{ type: 'KidProfile', id: childId }],
    }),
    getTeacherRewardCatalog: build.query<
      { rewards: TeacherRewardCatalogItem[]; assets: TeacherRewardAssetDto[] },
      string
    >({
      query: (childId) => ({ url: `/teacher/children/${childId}/catalog` }),
      providesTags: (_result, _error, childId) => [{ type: 'RewardCatalog', id: childId }],
    }),
    grantTeacherXp: build.mutation<
      { ok: true; awarded: boolean },
      { childId: string; body: TeacherXpGrantInput }
    >({
      query: ({ childId, body }) => ({ url: `/teacher/children/${childId}/xp`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { childId }) => [{ type: 'KidProfile', id: childId }],
    }),
    grantTeacherReward: build.mutation<
      { rewardId: string },
      { childId: string; body: TeacherRewardGrantInput }
    >({
      query: ({ childId, body }) => ({ url: `/teacher/children/${childId}/rewards`, method: 'POST', body }),
      invalidatesTags: (_result, _error, { childId }) => [{ type: 'KidProfile', id: childId }],
    }),
  }),
});

export const {
  useGetKidProfileQuery,
  useEquipKidRewardMutation,
  useGetTeacherRewardCatalogQuery,
  useGrantTeacherXpMutation,
  useGrantTeacherRewardMutation,
} = academyGamificationApi;
