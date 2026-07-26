import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
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
import { adminServiceCategoriesApi } from './api/admin-service-categories-api';
import { adminMediaAssetsApi } from './api/admin-media-assets-api';
import { adminHomePageApi } from './api/admin-home-page-api';
import { adminStylePresetsApi } from './api/admin-style-presets-api';
import { adminUsageApi } from './api/admin-usage-api';
import { adminDiagnosticsApi } from './api/admin-diagnostics-api';
import { adminMonitoringApi } from './api/admin-monitoring-api';
import { adminSettingsApi } from './api/admin-settings-api';
import { adminUsersApi } from './api/admin-users-api';
import { adminTeachersApi } from './api/admin-teachers-api';
import { adminProjectsApi } from './api/admin-projects-api';
import { adminPaymentsApi } from './api/admin-payments-api';
import { adminSupportApi } from './api/admin-support-api';
import { adminTokenPackagesApi } from './api/admin-token-packages-api';
import { servicesApi } from './api/services-api';
import { userMediaAssetsApi } from './api/user-media-assets-api';
import { userChatApi } from './api/user-chat-api';
import { supportApi } from './api/support-api';
import { familyApi } from './api/family-api';
import { adminCurriculumApi } from './api/admin-curriculum-api';
import { academyBookingApi } from './api/academy-booking-api';
import { academyMaterialsApi } from './api/academy-materials-api';
import { academyLessonTemplatesApi } from './api/academy-lesson-templates-api';
import { academyLessonInstancesApi } from './api/academy-lesson-instances-api';
import { academyGamificationApi } from './api/academy-gamification-api';
import { academyOperationsApi } from './api/academy-operations-api';
import { adminPayoutsApi } from './api/admin-payouts-api';
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
    [adminServiceCategoriesApi.reducerPath]: adminServiceCategoriesApi.reducer,
    [adminMediaAssetsApi.reducerPath]: adminMediaAssetsApi.reducer,
    [adminHomePageApi.reducerPath]: adminHomePageApi.reducer,
    [adminStylePresetsApi.reducerPath]: adminStylePresetsApi.reducer,
    [adminUsageApi.reducerPath]: adminUsageApi.reducer,
    [adminDiagnosticsApi.reducerPath]: adminDiagnosticsApi.reducer,
    [adminMonitoringApi.reducerPath]: adminMonitoringApi.reducer,
    [adminSettingsApi.reducerPath]: adminSettingsApi.reducer,
    [adminUsersApi.reducerPath]: adminUsersApi.reducer,
    [adminTeachersApi.reducerPath]: adminTeachersApi.reducer,
    [adminProjectsApi.reducerPath]: adminProjectsApi.reducer,
    [adminPaymentsApi.reducerPath]: adminPaymentsApi.reducer,
    [adminSupportApi.reducerPath]: adminSupportApi.reducer,
    [adminTokenPackagesApi.reducerPath]: adminTokenPackagesApi.reducer,
    [servicesApi.reducerPath]: servicesApi.reducer,
    [userMediaAssetsApi.reducerPath]: userMediaAssetsApi.reducer,
    [userChatApi.reducerPath]: userChatApi.reducer,
    [supportApi.reducerPath]: supportApi.reducer,
    [familyApi.reducerPath]: familyApi.reducer,
    [adminCurriculumApi.reducerPath]: adminCurriculumApi.reducer,
    [academyBookingApi.reducerPath]: academyBookingApi.reducer,
    [academyMaterialsApi.reducerPath]: academyMaterialsApi.reducer,
    [academyLessonTemplatesApi.reducerPath]: academyLessonTemplatesApi.reducer,
    [academyLessonInstancesApi.reducerPath]: academyLessonInstancesApi.reducer,
    [academyGamificationApi.reducerPath]: academyGamificationApi.reducer,
    [academyOperationsApi.reducerPath]: academyOperationsApi.reducer,
    [adminPayoutsApi.reducerPath]: adminPayoutsApi.reducer,
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
      adminServiceCategoriesApi.middleware,
      adminMediaAssetsApi.middleware,
      adminHomePageApi.middleware,
      adminStylePresetsApi.middleware,
      adminUsageApi.middleware,
      adminDiagnosticsApi.middleware,
      adminMonitoringApi.middleware,
      adminSettingsApi.middleware,
      adminUsersApi.middleware,
      adminTeachersApi.middleware,
      adminProjectsApi.middleware,
      adminPaymentsApi.middleware,
      adminSupportApi.middleware,
      adminTokenPackagesApi.middleware,
      servicesApi.middleware,
      userMediaAssetsApi.middleware,
      userChatApi.middleware,
      supportApi.middleware,
      familyApi.middleware,
      adminCurriculumApi.middleware,
      academyBookingApi.middleware,
      academyMaterialsApi.middleware,
      academyLessonTemplatesApi.middleware,
      academyLessonInstancesApi.middleware,
      academyGamificationApi.middleware,
      academyOperationsApi.middleware,
      adminPayoutsApi.middleware,
    ),
});

// Включает refetchOnFocus / refetchOnReconnect для всех API, у которых они помечены.
// Без этого фоновые вкладки тротлят таймеры поллинга (браузер замедляет setInterval
// в неактивной вкладке), и при возврате на вкладку результат генерации не подтягивается,
// пока не обновишь страницу. С listener'ами фокус/реконнект сразу форсит свежий запрос.
setupListeners(store.dispatch);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
