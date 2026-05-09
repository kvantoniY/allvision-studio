# Audit pre-P7a

Цель документа: зафиксировать текущее состояние админки, pipeline-конструктора, реестра AI-блоков, PiAPI usage/balance и UX ошибок перед составлением P7a-промпта. Код в рамках этого аудита не менялся.

## 1. Текущая архитектура админки

### Web pages

Админка живёт в route group `apps/web/src/app/(admin)` и публично доступна как `/admin/*`. Общий shell: `apps/web/src/app/(admin)/layout.tsx`, он вызывает `requireAdminPage()` и рендерит `AdminSidebarNav`.

- `apps/web/src/app/(admin)/admin/page.tsx` - редирект с `/admin` на `/admin/services`.
- `apps/web/src/app/(admin)/admin/services/page.tsx` - список data-driven услуг: фильтры, поиск, active/featured toggle, reorder, duplicate, delete, test-run.
- `apps/web/src/app/(admin)/admin/services/new/page.tsx` - создание услуги через `AdminServiceForm`.
- `apps/web/src/app/(admin)/admin/services/[id]/page.tsx` - редактирование услуги через `AdminServiceForm`.
- `apps/web/src/app/(admin)/admin/trends/page.tsx` - список записей таблицы `Trend` для legacy/public trends service: поиск, active toggle, reorder, delete.
- `apps/web/src/app/(admin)/admin/trends/new/page.tsx` - создание `Trend` через `AdminTrendForm`, загрузка preview video и thumbnail.
- `apps/web/src/app/(admin)/admin/trends/[id]/page.tsx` - редактирование `Trend` через `AdminTrendForm`.
- `apps/web/src/app/(admin)/admin/scenario-templates/page.tsx` - список `ScenarioTemplate`: фильтры category/status, active/featured toggle, reorder, delete.
- `apps/web/src/app/(admin)/admin/scenario-templates/new/page.tsx` - создание `ScenarioTemplate` через `AdminScenarioTemplateForm`.
- `apps/web/src/app/(admin)/admin/scenario-templates/[id]/page.tsx` - редактирование `ScenarioTemplate`.

`apps/web/src/components/admin/AdminSidebarNav.tsx` показывает активные разделы `Услуги`, `Тренды`, `Шаблоны сценариев`; `Юзеры` и `Проекты` есть только как disabled placeholders.

GAP: нет admin pages для users/projects/orders/moderation.

GAP: нет admin pages для analytics/usage/system.

### Admin API endpoints

Все admin routes монтируются в `apps/api/src/routes/admin/index.ts` под `/api/admin/*`.

`apps/api/src/routes/admin/blocks.ts`:

- `GET /api/admin/blocks` - возвращает `{ blocks: BLOCK_CATALOG }`.

`apps/api/src/routes/admin/services.ts`:

- `GET /api/admin/services` - список услуг, query: `page`, `limit`, `category`, `isActive`, `isFeatured`, `search`.
- `GET /api/admin/services/:id` - одна услуга.
- `POST /api/admin/services` - создать услугу, multipart: `data`, optional `previewImage`, `previewVideo`.
- `PATCH /api/admin/services/:id` - обновить услугу, multipart.
- `DELETE /api/admin/services/:id` - удалить услугу, блокируется активными `Project` и связанными `Trend`.
- `POST /api/admin/services/:id/reorder` - поменять `sortOrder` внутри категории, body `{ direction }`.
- `POST /api/admin/services/:id/duplicate` - создать скрытую копию услуги.
- `POST /api/admin/services/:id/test-run` - создать project с `mode: "test-run"` и job `service-pipeline`.

`apps/api/src/routes/admin/trends.ts`:

- `GET /api/admin/trends` - список `Trend`, query: `page`, `limit`, `serviceSlug`, `isActive`, `search`.
- `GET /api/admin/trends/:id` - один trend.
- `POST /api/admin/trends` - создать trend, multipart: `previewVideo`, `thumbnail`, fields `title`, `description`, `prompt`, `serviceSlug`, `aiModel`, `aiConfig`, `priceTokens`, `isActive`.
- `PATCH /api/admin/trends/:id` - обновить trend, multipart.
- `DELETE /api/admin/trends/:id` - удалить trend, блокируется активными `Project`.
- `POST /api/admin/trends/:id/reorder` - поменять `sortOrder`.

`apps/api/src/routes/admin/scenario-templates.ts`:

- `GET /api/admin/scenario-templates` - список шаблонов, query: `page`, `limit`, `category`, `isActive`, `isFeatured`, `search`.
- `GET /api/admin/scenario-templates/:id` - один шаблон.
- `POST /api/admin/scenario-templates` - создать шаблон, multipart: `previewVideo`, `previewImage`, plus form fields.
- `PATCH /api/admin/scenario-templates/:id` - обновить шаблон, multipart.
- `DELETE /api/admin/scenario-templates/:id` - удалить шаблон, блокируется active episodes.
- `POST /api/admin/scenario-templates/:id/reorder` - поменять `sortOrder`.

GAP: нет `/api/admin/usage`, `/api/admin/system`, `/api/admin/piapi/balance` или похожих endpoints.

### Admin role / permission model

Модель ролей в Prisma: `packages/database/prisma/schema.prisma`, enum `Role { USER ADMIN }`, поле `User.role`.

API:

- `apps/api/src/middleware/auth.ts` определяет `AuthUser.role: 'USER' | 'ADMIN'` и `requireAuth`.
- `apps/api/src/middleware/require-admin.ts` проверяет `req.user.role !== 'ADMIN'` и возвращает `403 FORBIDDEN_ADMIN_ONLY`.
- Каждый admin router вызывает `router.use(requireAuth, requireAdmin)`.
- В `apps/api/src/middleware/auth.ts` также есть отдельный `requireAdmin`, но admin routes импортируют `middleware/require-admin.ts`.

Web:

- `apps/web/src/middleware.ts` проверяет только наличие `accessToken` для `/dashboard/*` и `/admin/*`; роль там не проверяется.
- `apps/web/src/lib/auth.ts` функция `requireAdminPage()` вызывает `/api/auth/me`; если `me.role !== 'ADMIN'`, редиректит на `/dashboard`.
- `apps/web/src/app/(admin)/layout.tsx` вызывает `requireAdminPage()` до рендера админки.

GAP: нет granular permissions; есть только роль `ADMIN`.

GAP: middleware Next.js не валидирует роль локально, admin role gate зависит от server fetch `/api/auth/me` в layout и от API middleware.

### Analytics / usage / system

В `/admin/*` страниц analytics/usage/system нет. Поиск по `analytics`, `usage`, `system`, `metrics`, `stats` находит только user dashboard (`/api/account/dashboard`, `/dashboard`) и cookie preferences, не admin analytics.

GAP: нужно добавить admin-раздел usage/system, если P7a требует мониторинг PiAPI spend, баланс, ошибки и очереди.

## 2. Pipeline-конструктор в админке

Основной файл: `apps/web/src/components/admin/services/AdminServiceForm.tsx`.

Компоненты:

- `AdminServiceForm` - общий form create/edit.
- `PipelineBuilder` - список pipeline steps, drag-and-drop, add/remove, block selector, input field.
- `BlockParamsForm` - форма параметров конкретного блока по `block.paramsSchema`.
- `PipelineTestPanel` - polling результата admin test-run.

Источник blocks/models:

- Frontend вызывает `useGetAdminBlocksQuery()` из `apps/web/src/store/api/admin-services-api.ts`.
- Endpoint: `GET /api/admin/blocks`.
- API возвращает `BLOCK_CATALOG` из `@allvision/shared`, файл `packages/shared/src/blocks/catalog.ts`.

Как выбирается модель:

- Не свободный текст.
- Для `paramsSchema` key `model` или object schema `{ standard, pro }` используется dropdown для каждого tier: Standard и Pro.
- Dropdown options берутся из `block.supportedModels`.
- Label option: `${model.title} · ~${model.estimatedCostCoins}`.
- Default model выбирается через `preferredModel()`: сначала model с `tierHint === tier`, потом `tierHint === "both"`, потом первая модель.

Как вводятся params:

- `model` / tier-model object - два dropdown (`standard`, `pro`).
- `enum` - dropdown.
- `boolean` - checkbox.
- `number` - `<Input type="number">`.
- `string` - `<Input>`.
- String keys, содержащие `prompt` или `music`, рендерятся как `<Textarea rows={3}>`.
- `input` шага вводится отдельным free text input, placeholder `{{user.photo}}` или `{{step_1.output}}`.

Frontend validation:

- `validationErrors()` вызывает `validateUserInputForm()` и `validatePipelineConfig()` из `@allvision/shared`.
- Ошибки показываются в `PipelineBuilder` в блоке "Pipeline содержит ошибки".
- `AdminServiceForm.save()` и `runTest()` не выполняются при `errors.length > 0`.
- Browser `required` есть на обычных metadata fields, но полноценная валидация title/description/slug всё равно на API через zod.

Backend validation:

- `apps/api/src/routes/admin/services.ts` вызывает `parseAdminServiceData()`, `validateUserInputForm()`, `validatePipelineConfig()`.
- `validatePipelineConfig()` проверяет unknown block, duplicate step id, params по block `paramsSchema`, ссылки на user fields и ссылки только на предыдущие steps.

Подсказки админу:

- Есть `block.title`, цена в dropdown (`estimatedCostCoins`) и общая расчетная себестоимость Standard/Pro в `AdminServiceForm`.
- Есть короткая section description про placeholders `{{user.photo}}`, `{{step_1.output}}`.
- Model-specific description/limits/requiredParams в UI не показываются.

GAP: добавить model-level `description`, `limits`, `requiredParams`, `provider`, `endpoint`, `duration/fps/aspect` hints и вывести их рядом с dropdown.

GAP: добавить schema descriptions в `paramsSchema` и рендерить help text; сейчас используется в основном `title`.

GAP: добавить более дружелюбные frontend error messages вместо raw `INVALID_PARAMS:params.step_1.foo`.

## 3. Реестр блоков

Worker registry: `apps/worker/src/blocks/registry.ts`.

Shared catalog metadata: `packages/shared/src/blocks/catalog.ts`.

Worker block type: `apps/worker/src/blocks/types.ts`.

Shared model type: `packages/shared/src/blocks/types.ts`.

Поля `ModelOption`:

- `slug: string`
- `title: string`
- `tierHint: "standard" | "pro" | "both"`
- `estimatedCostCoins: number`
- `estimatedCostUsd?: number`

Поля `BlockCatalogItem`:

- `slug`
- `title`
- `description`
- `category`
- `paramsSchema`
- `supportedModels`

GAP: у `ModelOption` нет `description`, `limits`, `requiredParams`, `provider`, `providerModel`, `endpoint`, `availableInProviderMode`, `docsUrl`.

GAP: у `BlockCatalogItem` нет явного `inputRequirements` / `outputType` в shared catalog, хотя worker `BlockDefinition` имеет zod schemas.

### Полный список blocks и supportedModels

`image-restore`

- Description: restoration старого фото.
- Params: `model` tier object, `strength`.
- Models:
  - `mock-restore` - title `Mock restore placeholder`, `tierHint: both`, `estimatedCostCoins: 0`, `estimatedCostUsd: 0`.
- Executor: `apps/worker/src/blocks/image-restore.ts`, вызывает `AIProvider.imageRestore`.
- Real provider: `PiAPIProvider.imageRestore()` бросает `IMAGE_RESTORE_NOT_REAL`; provider selector считает block mock-only.

`image-upscale`

- Params: `model` tier object, `scale` enum `[2, 4]`.
- Models:
  - `upscale-x2` - title `Upscale x2 Mock`, `tierHint: standard`, `estimatedCostCoins: 2`.
  - `upscale-x4` - title `Upscale x4 Mock`, `tierHint: pro`, `estimatedCostCoins: 5`.
- Executor: `apps/worker/src/blocks/image-upscale.ts`, вызывает `AIProvider.imageRestore` с `operation: "upscale"`.
- Real provider: mock-only через `MOCK_ONLY_BLOCKS`; реального PiAPI upscale endpoint нет.

`image-to-video`

- Params: `model` tier object, `duration`, `prompt`.
- Models:
  - `kling-std` - title `Kling 2.6 Standard`, `tierHint: standard`, `estimatedCostCoins: 20`, `estimatedCostUsd: 0.20`.
  - `kling-pro` - title `Kling 2.6 Pro`, `tierHint: pro`, `estimatedCostCoins: 30`, `estimatedCostUsd: 0.33`.
- Executor: `apps/worker/src/blocks/image-to-video.ts`, вызывает `AIProvider.imageToVideo`.
- Real provider: `PiAPIProvider.imageToVideo()`.

`face-swap-video`

- Params: `model` tier object, `target_video`, `prompt`, `duration`, `estimatedFrames`.
- Models:
  - `qubico-video-toolkit` - title `Qubico Video Toolkit Face Swap`, `tierHint: both`, `estimatedCostCoins: 40`, `estimatedCostUsd: 0.48`.
- Executor: `apps/worker/src/blocks/face-swap-video.ts`, вызывает `AIProvider.faceSwapVideo`.
- Real provider: `PiAPIProvider.faceSwapVideo()`.

`video-compose`

- Params: `watermark`, `title`, `music`.
- Models:
  - `ffmpeg-local` - title `FFmpeg Local Mock`, `tierHint: both`, `estimatedCostCoins: 1`.
- Executor: `apps/worker/src/blocks/video-compose.ts`, локальный pass-through/compose placeholder, внешнего AI provider не вызывает.

`text-to-video`

- Params: `model` tier object, `prompt`, `duration`.
- Models:
  - `veo-3.1` - title `Veo 3.1 Mock`, `tierHint: standard`, `estimatedCostCoins: 45`.
  - `seedance-2.0-text` - title `Seedance 2.0 Text Mock`, `tierHint: pro`, `estimatedCostCoins: 80`.
- Executor: `apps/worker/src/blocks/text-to-video.ts`, вызывает `AIProvider.imageToVideo` с mock seed image.
- Real provider: mock-only через `MOCK_ONLY_BLOCKS`.

### Missing / partial executors

- `image-edit` отсутствует полностью: нет shared catalog entry, нет worker block, нет `AIProvider.imageEdit()`, нет PiAPIProvider executor.
- Nano Banana отсутствует: поиск по `Nano`, `banana` ничего не находит.
- `image-restore` есть как block, но PiAPI real не реализован.
- `image-upscale` есть как block, но PiAPI real не реализован.
- `text-to-video` есть как block, но real provider не реализован.

GAP: для P7a нужен новый `image-edit` block и метод provider interface, если цель - Nano Banana.

GAP: если нужен real upscale, добавить provider method отдельно от `imageRestore`, а не перегружать `imageRestore(operation: "upscale")`.

## 4. UserInputForm builder в админке

Файл: `apps/web/src/components/admin/services/AdminServiceForm.tsx`, компонент `UserInputFormBuilder`.

Как создаётся форма:

- `AdminServiceForm` хранит `draft.userInputForm`.
- `normaliseUserInputForm()` гарантирует ровно один tier-field: если tier отсутствует, добавляет default `tier`.
- `UserInputFormBuilder` показывает sortable список полей и live preview.
- Кнопки добавления: `text`, `textarea`, `photo`, `select`, `avatar`. `tier` нельзя добавить кнопкой повторно; он создаётся default logic и не удаляется.

Поддерживаемые типы:

- `text`
- `textarea`
- `photo`
- `select`
- `avatar`
- `tier`

Поля настройки:

- `id`
- `type`
- `label`
- `hint`
- `placeholder`
- `required`
- для `text`/`textarea`: `maxLength`
- для `photo`: `maxSizeMb`
- для `select`: options textarea в формате `Label:value`, по одной option на строку.

Schema: `packages/shared/src/schemas/admin-services.ts`, `userInputFieldSchema` также поддерживает `allowedFormats` и `avatarTypes`, но UI их почти не редактирует.

Frontend validation:

- `validateUserInputForm()` проверяет duplicate field ids, ровно один `tier`, select options required.
- Live preview есть справа: disabled inputs/select/photo/avatar/tier.
- Для service launch page (`apps/web/src/components/pages/ServiceDetail.tsx`) client validation проверяет required fields и `maxLength`.

Backend validation:

- Admin save: `validateUserInputForm()` и zod limits: `id`, `label`, `hint`, `placeholder`, `maxLength`, `maxSizeMb`, `options`.
- User launch: `apps/api/src/routes/services.ts` проверяет required fields, `maxLength`, select value входит в options.
- User launch upload: `uploadServiceLaunchInputs = baseMulter.any()` с global image-only limit 25 MB; `fileService.uploadUserInput()` повторно проверяет 25 MB и MIME `jpeg/png/webp`.

GAP: `field.maxSizeMb` из userInputForm не применяется при launch; используется глобальный 25 MB.

GAP: `field.allowedFormats` из userInputForm не редактируется в UI и не применяется при launch; используется фиксированный JPEG/PNG/WebP.

GAP: `avatarTypes` есть в schema, но builder не даёт управлять им.

GAP: preview формы disabled и не валидирует реальные значения/файлы.

## 5. AIUsageLog и его консьюмеры

Prisma model: `packages/database/prisma/schema.prisma`.

Полная схема:

```prisma
model AIUsageLog {
  id           String   @id @default(uuid())
  createdAt    DateTime @default(now())
  projectId    String?
  userId       String?
  blockSlug    String
  provider     String
  model        String
  taskId       String?
  status       String
  costUsd      Float
  durationMs   Int
  errorCode    String?
  errorMessage String?

  project Project? @relation(fields: [projectId], references: [id], onDelete: SetNull)

  @@index([createdAt])
  @@index([userId])
  @@index([projectId])
}
```

Где пишется:

- `apps/worker/src/providers/piapi-provider.ts`, private `logUsage()`.
- Успех/failed/timeout пишутся через `createAIUsageLog()` из `apps/worker/src/providers/usage-limits.ts`.
- Логируются только PiAPI calls в `PiAPIProvider.imageToVideo()` и `PiAPIProvider.faceSwapVideo()`.

Где читается:

- `apps/worker/src/providers/usage-limits.ts`:
  - `getPiAPISpendLast24h()` суммирует `costUsd` по `provider = 'piapi'` за 24 часа.
  - `assertPiAPIDailyCap()` использует этот aggregate перед новым PiAPI call.
  - `findLatestAIUsageLog(projectId)` читает последний log, но по prod-коду не используется; нужен тестам/diagnostics.
- Tests используют delete helpers.

Агрегаты:

- Есть только global PiAPI spend за последние 24 часа.
- Нет агрегатов по пользователю.
- Нет агрегатов по модели.
- Нет агрегатов по дню.
- Нет агрегатов по blockSlug/status/error.

Admin API:

- Нет endpoint для чтения `AIUsageLog`.
- Нет web UI для usage logs.

GAP: добавить `/api/admin/usage` с фильтрами `dateFrom/dateTo`, `provider`, `model`, `blockSlug`, `status`, `userId`, `projectId`.

GAP: добавить aggregates для day/model/block/status и карточки daily spend / success rate / timeout rate.

GAP: добавить retention/export policy для `AIUsageLog`.

## 6. PiAPI client и balance/usage

Client: `apps/worker/src/providers/piapi-client.ts`, class `PiAPIClient`.

`PiAPIClient.getAccountInfo()`:

- Делает `GET /account/info`.
- Парсит `equivalent_in_usd` из путей:
  - `equivalent_in_usd`
  - `data.equivalent_in_usd`
  - `balance.equivalent_in_usd`
- Возвращает `{ equivalentUsd, raw }`.
- Если число не найдено, `equivalentUsd = 0`.

Balance в worker:

- `apps/worker/src/providers/piapi-provider.ts`, class `PiAPIProvider`.
- Private field `lowBalance = false`.
- `initialise()` вызывает `refreshBalance()` при старте, затем `setInterval(..., 60 * 60 * 1000)` раз в час.
- `refreshBalance()` вызывает `client.getAccountInfo()`, ставит `this.lowBalance = account.equivalentUsd < balanceMinUsd`, логирует `$xx.xx`.
- `ensureCanCall()` перед каждым PiAPI call проверяет `lowBalance`, затем `assertPiAPIDailyCap()`.

Usage:

- Usage cost пишется в `AIUsageLog` после PiAPI task success/failed/timeout.
- Daily cap считается через `AIUsageLog` в БД, поэтому cap доступен worker-процессу.

Можно ли получить баланс из API процесса:

- Сейчас нет.
- `PiAPIClient` находится в `apps/worker/src/providers/piapi-client.ts`.
- `PiAPIProvider.client` private, `lowBalance` private.
- API process не инициализирует PiAPI client и не имеет route для balance.

GAP: добавить API-side service/client или shared PiAPI client для `/api/admin/piapi/account`.

GAP: не читать worker private memory из API; нужен отдельный API request к PiAPI или persisted balance snapshot в БД/Redis.

GAP: добавить `lastBalanceUsd`, `lastBalanceCheckedAt`, `lowBalance` в observable state для admin UI.

## 7. Существующие модели в реестре, доступные через PiAPI

### Kling Standard / Pro

Есть и реально подключены.

- Shared catalog: `packages/shared/src/blocks/catalog.ts`, block `image-to-video`.
- Models: `kling-std`, `kling-pro`.
- Worker block: `apps/worker/src/blocks/image-to-video.ts`.
- Provider selector: `apps/worker/src/providers/index.ts`, `PIAPI_BLOCKS` включает `image-to-video`.
- PiAPI provider: `apps/worker/src/providers/piapi-provider.ts`, `imageToVideo()`.
- PiAPI payload:
  - `model: "kling"`
  - `task_type: "video_generation"`
  - `input.mode: "std"` for `kling-std`, `"pro"` for `kling-pro`
  - `input.duration`, `input.image_url`, `input.prompt`, `negative_prompt`.

### Qubico video face-swap

Есть и реально подключён.

- Shared catalog: block `face-swap-video`, model `qubico-video-toolkit`.
- Worker block: `apps/worker/src/blocks/face-swap-video.ts`.
- Provider selector: `PIAPI_BLOCKS` включает `face-swap-video`.
- PiAPI provider: `faceSwapVideo()`.
- PiAPI payload:
  - `model: "Qubico/video-toolkit"`
  - `task_type: "face-swap"`
  - `input.swap_image`
  - `input.target_video`

### Nano Banana

Не реализован.

- Нет block `image-edit`.
- Нет model slug, содержащего Nano/Banana.
- Нет `AIProvider.imageEdit()`.
- Нет `PiAPIProvider.imageEdit()`.

GAP: Nano Banana - главный candidate для P7a: добавить block, model registry metadata, mock/stub/provider methods, PiAPI payload, tests, admin hints.

### Image upscale

Реального PiAPI endpoint нет.

- Shared block `image-upscale` есть.
- Models `upscale-x2`, `upscale-x4` mock.
- Worker executor вызывает `AIProvider.imageRestore()` с `operation: "upscale"`.
- Provider selector относит `image-upscale` к `MOCK_ONLY_BLOCKS`.
- `PiAPIProvider.imageRestore()` бросает `IMAGE_RESTORE_NOT_REAL`.

GAP: если upscale нужен в P7a, выделить real provider method `imageUpscale()` и добавить PiAPI/другой endpoint явно.

## 8. Trend-видео обработка

Для `face-in-trend` текущая конфигурация лежит в `packages/database/src/seed.ts` внутри service object:

- `Service.slug = "face-in-trend"`.
- `previewVideo = trendVideo(1)`.
- `userInputForm` содержит select field:
  - `id: "trendVideo"`
  - `type: "select"`
  - options: `trendVideo(1)`, `trendVideo(2)`, `trendVideo(3)`.
- `pipelineConfig[0]` block `face-swap-video`, params:
  - `target_video: "{{user.trendVideo}}"`
  - model `qubico-video-toolkit`.

`trendVideo()` в seed строит URL `${PUBLIC_API_URL}/static/trends/trend-N.mp4`.

Где файлы в prod:

- VM shared folder: `/opt/allvision-studio/shared/public-trends`.
- Docker nginx mount: `infra/prod/docker-compose.prod.yml` монтирует в `/var/www/trends`.
- Nginx route: `infra/prod/nginx.prod.conf`, `location /static/trends/`.

Таблица `Trend`:

- Есть Prisma model `Trend` в `packages/database/prisma/schema.prisma`.
- Есть admin UI `/admin/trends`.
- Есть public API `/api/public/trends`.
- Но это отдельный legacy/public trends catalog, привязанный к service slug `trends`.

Можно ли админу редактировать список трендов для `face-in-trend`:

- Непрямо да: `/admin/services/:id` позволяет вручную редактировать `userInputForm` select options как textarea `Label:value`.
- Но dedicated UI, который берёт `/admin/trends` или файлы `/static/trends/*` и синхронизирует options `face-in-trend`, отсутствует.
- Seed задаёт initial options только при первом заполнении БД; после prod deploy seed не перетирает существующие service records.

GAP: связать `face-in-trend` options с таблицей `Trend` или добавить отдельную таблицу/админку `TrendVideoAsset`.

GAP: добавить безопасный UI для редактирования select video options без ручного `Label:value`.

GAP: добавить upload/manage flow для `/static/trends/*` или хранить trend videos через обычный storage.

## 9. Обработка ошибок на странице результата

Файлы:

- `apps/web/src/app/dashboard/projects/[id]/page.tsx` - server fetch initial project.
- `apps/web/src/app/dashboard/projects/[id]/ProjectPageContent.tsx` - основной render.
- `apps/web/src/store/api/projects-api.ts` - RTK Query для `/api/projects/:id` и `/api/projects/:id/status`.
- `apps/api/src/routes/projects.ts` - отдаёт `errorMessage`, `stepProgress`.

Pipeline project (`project.pipelineSnapshot` есть):

- Если `status === "FAILED"`, `ProjectPageContent` показывает destructive `Alert`.
- Title: "Не удалось создать подарок".
- Body: `errorMessage ?? "Произошла ошибка при генерации проекта."`.
- Дополнительно всегда пишет, что коины возвращены.
- Есть кнопка retry на `retryHrefFor(project)`.
- Step-level errors показываются в `StepProgressList`, если `step.errorMessage` есть.

Non-pipeline legacy project:

- Аналогично показывает destructive `Alert`.
- Title: "Обработка не удалась".
- Body: `errorMessage ?? "Произошла ошибка при обработке проекта."`.

Где формируется errorMessage:

- `apps/worker/src/pipeline-runner.ts` catch block.
- Для `DAILY_CAP_EXCEEDED` и `LOW_PROVIDER_BALANCE` используется `providerUnavailableMessage` из `apps/worker/src/providers/provider-errors.ts`.
- Для остальных ошибок используется `(err as Error).message`.
- `markProjectFailed(..., { refundTokens: true })` возвращает коины.

PIAPI_TIMEOUT:

- `PiAPIClient.pollUntilDone()` бросает `ProviderError('PIAPI_TIMEOUT', 'PiAPI task ... timed out')`.
- `isProviderUserSafeError()` не считает `PIAPI_TIMEOUT` user-safe.
- Пользователь увидит raw message `PiAPI task ... timed out`.

PROVIDER_ERROR / PIAPI_HTTP / PIAPI_NETWORK / PIAPI_EMPTY_OUTPUT:

- Нет отдельного frontend mapping.
- Пользователь увидит raw `errorMessage` из provider/pipeline.

INSUFFICIENT_TOKENS:

- Возникает до создания project в `POST /api/services/:slug/launch` или legacy `POST /api/projects`.
- На странице результата обычно не появляется, потому что project не создан.
- На странице услуги `apps/web/src/components/pages/ServiceDetail.tsx` есть catch для `INSUFFICIENT_TOKENS` и redirect `/pricing`.

GAP: добавить shared mapping provider/user error codes to human messages.

GAP: сохранять `errorCode` в `Project` или `stepProgress`, а не только text `errorMessage`.

GAP: считать `PIAPI_TIMEOUT`, `PIAPI_NETWORK_ERROR`, `PIAPI_HTTP_5xx`, `PIAPI_EMPTY_OUTPUT` user-safe с дружелюбным текстом, но оставлять raw diagnostics для admin.

GAP: admin view должен показывать raw provider code/taskId/log, а user view - короткий безопасный текст.

## 10. Hotfix preview-видео - что было сделано

Файл: `apps/web/src/components/pages/ServiceDetail.tsx`.

Что изменено:

- Добавлена функция `videoPreviewUrl(value)`:
  - normalizes через `mediaUrl()`;
  - принимает только `http(s)` URL, заканчивающиеся на `.mp4` с optional query/hash.
- Добавлена функция `selectedVideoPreview(fields, values)`:
  - ищет первый `select` field, у которого хотя бы одна option value выглядит как video URL;
  - берёт текущее выбранное значение из `values[field.id]`;
  - если выбранный value валиден как video URL, возвращает его.
- `ServiceDetail` теперь считает:
  - `selectedPreviewVideo = useMemo(() => selectedVideoPreview(fields, values), [fields, values])`;
  - `previewVideo = selectedPreviewVideo ?? mediaUrl(service.previewVideo)`.
- В `<video>` добавлен `key={previewVideo}`, поэтому при смене dropdown video remount/reload и снова стартует с `muted loop playsInline autoPlay controls`.
- Preview video layout заменён:
  - wrapper `bg-slate-950`;
  - inner container `aspect-[9/16] h-[70vh] min-h-[360px] max-h-[620px] max-w-full`;
  - video class `h-full w-full object-contain`.

Поведение:

- Для `face-in-trend` выбор `trendVideo` в dropdown справа переключает preview слева.
- Для услуг без select video URL fallback остаётся `service.previewVideo`.
- Хардкода под slug `face-in-trend` нет.

GAP: сейчас video select определяется эвристикой URL `.mp4`; для P7a лучше добавить в `UserInputField` явный metadata flag, например `previewRole: "servicePreviewVideo"` или `mediaKind: "video"`.
