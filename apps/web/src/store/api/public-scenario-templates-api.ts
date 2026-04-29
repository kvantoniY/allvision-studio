import type {
  PublicScenarioTemplateResponse,
  PublicScenarioTemplatesResponse,
} from '@allvision/shared';
import { publicApi } from './public-api';

export type PublicScenarioTemplatesQuery = {
  category?: string;
  isFeatured?: boolean;
};

export const publicScenarioTemplatesApi = publicApi.injectEndpoints({
  endpoints: (build) => ({
    listPublicScenarioTemplates: build.query<PublicScenarioTemplatesResponse, PublicScenarioTemplatesQuery | void>({
      query: (q) => {
        const params = new URLSearchParams();
        if (q?.category) params.set('category', q.category);
        if (q?.isFeatured !== undefined) params.set('isFeatured', String(q.isFeatured));
        const suffix = params.toString();
        return { url: suffix ? `/scenario-templates?${suffix}` : '/scenario-templates' };
      },
      providesTags: ['ScenarioTemplates'],
    }),
    getPublicScenarioTemplate: build.query<PublicScenarioTemplateResponse, string>({
      query: (slug) => ({ url: `/scenario-templates/${slug}` }),
      providesTags: (_result, _error, slug) => [{ type: 'ScenarioTemplates', id: slug }],
    }),
  }),
});

export const {
  useListPublicScenarioTemplatesQuery,
  useGetPublicScenarioTemplateQuery,
} = publicScenarioTemplatesApi;
