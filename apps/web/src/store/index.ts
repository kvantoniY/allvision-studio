import { configureStore } from '@reduxjs/toolkit';
import { authApi } from './api/auth-api';
import { publicApi } from './api/public-api';
import { accountApi } from './api/account-api';
import { paymentsApi } from './api/payments-api';
import { projectsApi } from './api/projects-api';
import { adminTrendsApi } from './api/admin-trends-api';
import { charactersApi } from './api/characters-api';
import { scenesApi } from './api/scenes-api';
import { episodesApi } from './api/episodes-api';
import { adminScenarioTemplatesApi } from './api/admin-scenario-templates-api';
import { authReducer } from './slices/auth-slice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [publicApi.reducerPath]: publicApi.reducer,
    [accountApi.reducerPath]: accountApi.reducer,
    [paymentsApi.reducerPath]: paymentsApi.reducer,
    [projectsApi.reducerPath]: projectsApi.reducer,
    [adminTrendsApi.reducerPath]: adminTrendsApi.reducer,
    [charactersApi.reducerPath]: charactersApi.reducer,
    [scenesApi.reducerPath]: scenesApi.reducer,
    [episodesApi.reducerPath]: episodesApi.reducer,
    [adminScenarioTemplatesApi.reducerPath]: adminScenarioTemplatesApi.reducer,
  },
  middleware: (getDefault) =>
    getDefault().concat(
      authApi.middleware,
      publicApi.middleware,
      accountApi.middleware,
      paymentsApi.middleware,
      projectsApi.middleware,
      adminTrendsApi.middleware,
      charactersApi.middleware,
      scenesApi.middleware,
      episodesApi.middleware,
      adminScenarioTemplatesApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
