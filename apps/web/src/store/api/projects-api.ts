import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQueryWithReauth } from './base-query';
import type { Project, ProjectStatus, ServiceCategory } from '@allvision/shared';
import { accountApi } from './account-api';
import { authApi } from './auth-api';

export type ProjectSummary = Pick<
  Project,
  'id' | 'status' | 'progress' | 'tokensCost' | 'createdAt' | 'serviceId' | 'title'
>;

export type ProjectService = {
  slug: string;
  title: string;
  category: ServiceCategory;
  coverImage?: string | null;
  galleryImages?: string[];
  previewImage?: string | null;
  previewVideo?: string | null;
  previewMode?: string | null;
};

export type ProjectDetails = Project & {
  service: ProjectService | null;
};

export type ProjectListItem = Project & {
  service: ProjectService | null;
};

export type ProjectStatusResponse = Pick<
  Project,
  | 'id'
  | 'status'
  | 'progress'
  | 'resultImage'
  | 'resultVideo'
  | 'resultThumbnail'
  | 'errorMessage'
  | 'errorCode'
  | 'completedAt'
> & {
  stepProgress?: Array<{
    stepId: string;
    blockSlug: string;
    status: string;
    progress: number;
    output?: unknown;
    errorMessage?: string;
  }>;
};

export type ProjectsQuery = {
  page?: number;
  limit?: number;
  status?: ProjectStatus;
  serviceSlug?: string;
};

export type ProjectsResponse = {
  items: ProjectListItem[];
  total: number;
  page: number;
  limit: number;
};

export const projectsApi = createApi({
  reducerPath: 'projectsApi',
  baseQuery: createBaseQueryWithReauth('/api/projects'),
  tagTypes: ['Project', 'ProjectStatus'],
  endpoints: (build) => ({
    createProject: build.mutation<{ project: ProjectSummary }, FormData>({
      query: (body) => ({ url: '/', method: 'POST', body }),
      invalidatesTags: ['Project'],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        await queryFulfilled;
        invalidateProjectSideEffects(dispatch);
      },
    }),
    getProject: build.query<ProjectDetails, string>({
      query: (id) => ({ url: `/${id}` }),
      providesTags: (_result, _error, id) => [{ type: 'Project', id }],
    }),
    getProjectStatus: build.query<ProjectStatusResponse, string>({
      query: (id) => ({ url: `/${id}/status` }),
      providesTags: (_result, _error, id) => [{ type: 'ProjectStatus', id }],
    }),
    listProjects: build.query<ProjectsResponse, ProjectsQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        params.set('page', String(q?.page ?? 1));
        params.set('limit', String(q?.limit ?? 20));
        if (q?.status) params.set('status', q.status);
        if (q?.serviceSlug) params.set('serviceSlug', q.serviceSlug);
        return { url: `/?${params.toString()}` };
      },
      providesTags: ['Project'],
    }),
  }),
});

type InvalidateAction =
  | ReturnType<typeof accountApi.util.invalidateTags>
  | ReturnType<typeof authApi.util.invalidateTags>;

export function invalidateProjectSideEffects(dispatch: (action: InvalidateAction) => unknown) {
  dispatch(accountApi.util.invalidateTags(['User', 'Dashboard', 'Transactions']));
  dispatch(authApi.util.invalidateTags(['Me', 'User']));
}

export const {
  useCreateProjectMutation,
  useGetProjectQuery,
  useGetProjectStatusQuery,
  useListProjectsQuery,
} = projectsApi;
