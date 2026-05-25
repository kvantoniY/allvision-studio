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
import { adminServicesApi } from './api/admin-services-api';
import { adminMediaAssetsApi } from './api/admin-media-assets-api';
import { adminHomePageApi } from './api/admin-home-page-api';
import { adminStylePresetsApi } from './api/admin-style-presets-api';
import { adminUsageApi } from './api/admin-usage-api';
import { adminDiagnosticsApi } from './api/admin-diagnostics-api';
import { adminSettingsApi } from './api/admin-settings-api';
import { adminUsersApi } from './api/admin-users-api';
import { adminProjectsApi } from './api/admin-projects-api';
import { adminPaymentsApi } from './api/admin-payments-api';
import { adminSupportApi } from './api/admin-support-api';
import { servicesApi } from './api/services-api';
import { userMediaAssetsApi } from './api/user-media-assets-api';
import { userChatApi } from './api/user-chat-api';
import { supportApi } from './api/support-api';
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
    [adminServicesApi.reducerPath]: adminServicesApi.reducer,
    [adminMediaAssetsApi.reducerPath]: adminMediaAssetsApi.reducer,
    [adminHomePageApi.reducerPath]: adminHomePageApi.reducer,
    [adminStylePresetsApi.reducerPath]: adminStylePresetsApi.reducer,
    [adminUsageApi.reducerPath]: adminUsageApi.reducer,
    [adminDiagnosticsApi.reducerPath]: adminDiagnosticsApi.reducer,
    [adminSettingsApi.reducerPath]: adminSettingsApi.reducer,
    [adminUsersApi.reducerPath]: adminUsersApi.reducer,
    [adminProjectsApi.reducerPath]: adminProjectsApi.reducer,
    [adminPaymentsApi.reducerPath]: adminPaymentsApi.reducer,
    [adminSupportApi.reducerPath]: adminSupportApi.reducer,
    [servicesApi.reducerPath]: servicesApi.reducer,
    [userMediaAssetsApi.reducerPath]: userMediaAssetsApi.reducer,
    [userChatApi.reducerPath]: userChatApi.reducer,
    [supportApi.reducerPath]: supportApi.reducer,
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
      adminServicesApi.middleware,
      adminMediaAssetsApi.middleware,
      adminHomePageApi.middleware,
      adminStylePresetsApi.middleware,
      adminUsageApi.middleware,
      adminDiagnosticsApi.middleware,
      adminSettingsApi.middleware,
      adminUsersApi.middleware,
      adminProjectsApi.middleware,
      adminPaymentsApi.middleware,
      adminSupportApi.middleware,
      servicesApi.middleware,
      userMediaAssetsApi.middleware,
      userChatApi.middleware,
      supportApi.middleware,
    ),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
