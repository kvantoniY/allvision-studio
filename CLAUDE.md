# Allvision Studio — AI-фабрика цифровых подарков

## Что это

Платформа автоматического и заказного создания цифровых подарков с использованием AI: оживление старых фото, лицо в трендовом меме, ребёнок-герой мультика, юбилейные видео-открытки, авторские сказки.

Юзер не думает в терминах «AI-генерация» или «промпт». Юзер выбирает повод и формат («оживить свадебное фото бабушки»), получает готовый продукт за минуты (для готовых решений) или за несколько дней (для премиум-заказов).

## Категории услуг

1. **Ностальгия** — оживление старых фото, восстановление, эстетика 2017, лента воспоминаний.
2. **Тренды и мемы** — трендовые танцы, лицо в меме, лицо в киносцене, аниме-стилизация.
3. **Дети-герои** — ребёнок в мульт-стиле (свои стилизованные миры, не Disney), персонализированные сказки, развивающее видео с именем.
4. **Особые поводы** — свадьба, юбилей, 8 марта, 23 февраля, корпоративы.

В каждой категории два уровня:
- **Готовое решение** — автоматический pipeline, фиксированная цена, 2-5 минут от заявки до результата.
- **На заказ** — форма с брифом, ручная согласовка через админа, 3-5 дней, цена обсуждается.

## Качество AI: tier'ы

В системе **два уровня качества** на каждой услуге, юзер выбирает на странице услуги:

- **Standard** — высокое качество (Kling 2.6 / Veo 3.1 для видео, Nano Banana 2 для изображений, F5-TTS для голоса, Claude Haiku 4.5 для текста). Цена базовая.
- **Pro** — топ-качество (Seedance 2.0 для видео, GPT Image 2 для изображений, ElevenLabs для голоса, Claude 4 для текста). Цена 2-3× выше.

Это позиционирование «хорошо vs топ», не «средне vs хорошо». Standard — достаточно качественно для подарка. Pro — wow-эффект.

## Архитектура

### Технический стек

- Монорепо: `apps/api` (Express+Prisma), `apps/worker` (BullMQ), `apps/web` (Next.js+RTK Query), `packages/database` (Prisma schema), `packages/shared` (типы и константы).
- БД: PostgreSQL.
- Очереди: Redis + BullMQ.
- Storage: локальный для dev (`fileService` через LocalFileStorage), S3-compatible для prod (через ту же абстракцию).
- Платежи: ЮKassa для топапа коинов в РФ. AI-провайдеры (PiAPI / AIMLAPI) — оплачиваются разработчиком отдельно через крипту/зарубежную карту.
- Mock-first: реальные AI-провайдеры подключаются после готового продуктового каркаса.

## Production

Prod-домен `https://allvision-pulse.ru` живёт на ВМ `158.160.209.107`: хостовый nginx терминирует SSL сертификатом Рег.ру и проксирует на docker nginx, который слушает только `127.0.0.1:80`. Studio деплоится capistrano-style в `/opt/allvision-studio`: `current` и `previous` указывают на релизы в `releases/{git-sha}`, а постоянные данные лежат в `shared/.env`, `shared/postgres_data`, `shared/uploads`, `shared/public-trends`. Prod default для P6.5 — `PROVIDER_MODE=mock`, `STORAGE_PUBLISHER=local`; реальный PiAPI включается операционно через env без изменений кода.

### Studio assets

В системе три типа персональных ассетов юзера:

- **Avatar** — реалистичный аватар (человек, питомец, объект). Создаётся через 4-шаговый мастер с consent + NSFW-проверкой. Первый аватар бесплатный, второй+ — за коины. Используется в pipelines, требующих лицо.
- **Scene** — сцена/локация (для будущих сложных pipelines, опционально).
- **Voice** — голос для TTS (опционально, для сказок и видео-открыток с озвучкой).

Ассеты создаются один раз и переиспользуются в множестве услуг.

### Реестр блоков (программная часть pipelines)

Блок — это атомарная AI-операция, описанная в коде. Каждый блок:

- `inputSchema` (zod) — что блок принимает.
- `outputSchema` — что возвращает (URL файла + metadata).
- `paramsSchema` — какие параметры админ может настроить.
- `supportedModels` — список моделей с метаданными (название, tier hint, estimatedCost).
- `executor` — функция `(params, ctx) → output`, с прогрессом через `ctx.reportProgress(percent)`.

Стартовый набор блоков (P1, минимум под первые 5 услуг):

- `image-restore` — восстановление старого фото.
- `image-upscale` — увеличение разрешения.
- `image-to-video` — анимация фото в видео.
- `face-swap-video` — свап лица в готовом видео.
- `video-compose` — финальная сборка через ffmpeg (watermark, музыка, титры).
- `text-to-video` — генерация видео по промпту.

Остальные блоки (`text-to-image`, `text-to-speech`, `voice-clone`, `audio-mix`, `image-edit`, `image-stylize`, `add-subtitles` и т.д.) добавляются отдельными этапами, когда появляются услуги, которым они нужны.

Реестр блоков (`apps/worker/src/blocks/registry.ts`) — статичный TypeScript-объект. Реестр автоматически экспортируется в API через эндпоинт `GET /api/admin/blocks`, чтобы админка показывала список доступных блоков и их параметров.

### PiAPI и реальные providers (P6)

В P6 реальные внешние вызовы разрешены только из data-driven очереди `service-pipeline`, которая создаётся платным запуском `POST /api/services/:slug/launch`.

Матрица блоков:

- `image-restore` — **mock до P6.5**. У PiAPI нет нормального old-photo restoration endpoint; `Qubico/image-toolkit` upscale/face_enhance не считается восстановлением старого фото. Нужен внешний провайдер, кандидат — Replicate GFPGAN или аналог.
- `image-upscale` — mock.
- `image-to-video` — PiAPI Kling: `kling-std` (`model: "kling"`, `mode: "std"`, ~$0.20 / 5 sec) и `kling-pro` (`mode: "pro"`, ~$0.33 / 5 sec).
- `face-swap-video` — PiAPI `Qubico/video-toolkit`, `task_type: "face-swap"`, ориентир $0.004/frame. В P6 tier'ы Standard/Pro используют одну модель `qubico-video-toolkit`.
- `video-compose` — локальный compose/pass-through финального видео, без внешнего AI-провайдера.
- `text-to-video` — mock.

Provider selection живёт в `apps/worker/src/providers/index.ts`:

- `NODE_ENV === "test"` → `StubAIProvider`, никаких сетевых вызовов.
- Admin `POST /api/admin/services/:id/test-run` ставит job с `mode: "test-run"` → worker использует MockAIProvider, PiAPI не вызывается.
- Mock-only блоки (`image-restore`, `image-upscale`, `text-to-video`) используют MockAIProvider.
- Real блоки (`image-to-video`, `face-swap-video`) используют PiAPIProvider.

Worker стартует fail-fast: для production нужны `PIAPI_API_KEY` и R2-настройки. Тихого fallback на mock нет, чтобы юзер не платил коины за плейсхолдер.

PiAPI принимает публичные URL для входных изображений в Kling/video face-swap. Поэтому worker публикует локальные `/static/...` user-input файлы во временный Cloudflare R2 bucket (`R2_TEMP_PREFIX`, lifecycle cleanup ~24h), передаёт public URL в PiAPI, затем скачивает provider output обратно в LocalFileStorage по пути `outputs/{userId}/{projectId}/{stepId}/result.ext`.

Защита бюджета:

- `AIUsageLog` хранит provider/model/taskId/status/costUsd/duration/error по каждому PiAPI-вызову.
- Перед реальным вызовом считается spend provider=`piapi` за последние 24 часа; при достижении `PIAPI_DAILY_CAP_USD` job падает в `FAILED`, коины возвращаются, UI показывает безопасное сообщение про временную перегрузку.
- На старте и раз в час PiAPIProvider вызывает `/account/info`; если `equivalent_in_usd < PIAPI_BALANCE_MIN_USD`, новые PiAPI-задачи отклоняются.
- BullMQ worker для `service-pipeline` работает с `concurrency: 1`, чтобы дорогие job'ы не стартовали параллельно.

Чтобы добавить новый real-блок: добавить метод в worker `AIProvider`, реализацию в `PiAPIProvider`/Mock/Stub, mapping в provider selector, supportedModels с `estimatedCostCoins`/`estimatedCostUsd`, и тест без внешней сети.

### Pipeline-подход (готовые решения)

Pipeline услуги — это последовательность шагов (steps), полностью описанная в БД. Шаги собираются админом в `/admin/services` через табличный конструктор: список шагов сверху вниз, drag-handle для перестановки, у каждого шага раскрывающаяся форма параметров.

Pipeline хранится в `Service.pipelineConfig: Json` как массив:

```json
[
  { "id": "step_1", "blockSlug": "image-restore", "params": { "model": "gfpgan" } },
  { "id": "step_2", "blockSlug": "image-to-video", "params": { "model": "{{tier_model}}", "duration": 5, "prompt": "..." } },
  { "id": "step_3", "blockSlug": "video-compose", "params": { "watermark": true } }
]
```

Шаги могут ссылаться на результаты предыдущих через плейсхолдеры (`{{step_1.output}}`), на ввод юзера (`{{user.photo}}`, `{{user.name}}`), на выбранный tier (`{{tier_model}}` подставит модель Standard или Pro).

Универсальный исполнитель в worker (`pipeline-runner.ts`) принимает массив шагов и состояние, прогоняет последовательно с прогрессом по общему процессу.

В первой версии — только линейные pipelines, без if/else. Ветвления добавляются отдельным этапом, когда понадобятся.

### Admin services (готовые решения как продуктовые единицы)

Услуга в БД (`Service`, расширение существующей модели `Trend`) хранит:

- `slug` — URL-идентификатор.
- `title`, `shortDesc`, `description` — тексты для витрины.
- `category` — Ностальгия / Тренды / Дети / Особые поводы.
- `pipelineConfig: Json` — массив шагов pipeline (см. выше).
- `userInputForm: Json` — описание формы для юзера на странице услуги (поля, типы, валидация).
- `priceCoinsStandard`, `priceCoinsPro` — цены за два tier'а.
- `previewImage`, `previewVideo` — для каталога и страницы услуги.
- `isActive`, `isFeatured`, `sortOrder`.

Админ в `/admin/services` создаёт и редактирует услуги полностью через UI:

- Конструктор pipeline (табличный, с drag-handle).
- Редактор формы юзера.
- Калькулятор себестоимости (сумма estimatedCost всех шагов).
- Тестовый прогон с моковыми данными.
- Управление превью и метаданными.

Программист в код добавляет новые блоки в реестр, когда появляется потребность в новой AI-операции.

### Admin custom orders (заказы — полностью data-driven)

Услуги «на заказ» **полностью настраиваются через админку**, никакого кода. CRUD включает:

- Типы заказов (Custom Tale, Custom Cartoon, Custom Wedding и т.д.) — создаются админом.
- Формы брифа — поля формы прописываются в админке (тип поля, label, required, hints, варианты для select).
- Прайс-вилки и описания.
- Шаблоны email-уведомлений на каждый статус (NEW → QUOTED → PAID → IN_PROGRESS → DELIVERED → CANCELLED) — редактируются текстом в админке.
- Шаблоны типовых вопросов админа в первом ответе на заявку.

Юзер на витрине видит карточки заказов с описанием и формой. Админ ведёт заявки через `/admin/orders` (Kanban или таблица).

### IP-стратегия

Услуги для детей и тренды используют **свои стилизованные миры**, не реальные IP. «Цветной Грузовичок в долине радуги» вместо Синего Трактора. «Лесная девочка и большой друг» вместо Маши и Медведя. Стиль анимации копируется (плоская 2D, яркие цвета), персонажи и имена — оригинальные. Это позволяет масштабироваться без юр-рисков.

Тренды-мемы используют публичные форматы (танцы, киноэпизоды старше 70 лет, общеизвестные шаблоны) — но не дипфейки публичных людей.

## Финансовая модель

- Юзер платит **коинами** (1 коин = ориентировочно 1 ₽).
- Топап через ЮKassa в рублях (РФ-юр).
- Стартовый бонус новому юзеру — 25 коинов (хватает на ознакомление, не на полноценный подарок).
- AI-провайдеры (PiAPI / AIMLAPI) оплачиваются разработчиком — это операционный расход, не «прогон денег клиентов».
- Маржа: на готовых решениях 80-90% (себестоимость ~10-50 ₽, цена 200-500 ₽). На заказах 70-80% (себестоимость 200-400 ₽, цена 1500-7000 ₽).
- Refund при FAILED — автоматический возврат коинов через `CoinTransaction(reason='refund')`.
- Регенерация — 50% от исходной цены.
- Снятие watermark — фиксированная цена (30-60 коинов).

## Состояние кода

База: Studio v1 (зафиксирована тегом `v0.1-pre-rework`, 137 passing tests). Содержит:

- Auth (регистрация, логин, password reset).
- Кабинет, биллинг, профиль.
- Топап через mock-ЮKassa с idempotent webhook.
- Услуги 1-3 (улучшение фото / анимация / тренды) — рабочий e2e flow на mock'ах.
- V3 модели (Avatar / Scene / Episode) с CRUD и mock-pipelines.
- Mock email infrastructure (логирование вместо отправки).

Текущий продукт **переупаковывается** поверх этой базы под gift factory позиционирование без переписывания нижних слоёв. Конкретные шаги — в плане ниже.

История развития хранится только в git tags:
- `v0.1-pre-rework` — Studio v1 закрытая (137 tests).
- `pre-rollback-R1-20260505` — Allvision AI R0+R1 состояние (откатано).

## План перепрофилирования

### Этап P1 ✅ — БД, реестр блоков, pipeline-runner (бэкенд без UI)

- Расширение модели Trend → Service с полями pipelineConfig, userInputForm, priceCoinsStandard/Pro, category.
- Категории как enum (Ностальгия / Тренды / Дети / Особые поводы).
- Реестр блоков в коде (6 стартовых блоков, mock-implementations).
- Универсальный pipeline-runner в worker.
- API endpoints: список блоков для админки, тестовый прогон pipeline.
- Миграция БД, seed обновлённый.

### Этап P2 ✅ — Админка услуг с табличным конструктором (UI)

- `/admin/services` CRUD: список, создание, редактирование.
- Табличный конструктор pipeline (список шагов, drag-handle, форма параметров для каждого).
- Конструктор формы юзера (`UserInputForm`).
- Тестовый прогон в админке с моковыми данными и просмотром логов каждого шага.
- Калькулятор себестоимости.
- Управление превью (image/video) и метаданными.
- Toggle isActive/isFeatured, sortOrder.

### Этап P3 — Frontend перепаковка

- Главная страница в новом позиционировании (4 категории, hero с примерами подарков).
- Страница услуги с двумя tier-кнопками (Standard / Pro).
- Каталог услуг по категориям.
- Обновление dashboard юзера под новую витрину.

### Этап P4 — Расширение админки готовых решений

- Полировка data-driven конструктора: версии pipeline, шаблоны услуг, расширенные проверки плейсхолдеров.
- Drag-and-drop sort внутри категории, bulk-actions, массовое включение/скрытие.
- Замена ассетов (preview), live-preview на публичной странице услуги после P3.

### Этап P5 — Полная админка заказов (data-driven)

- `/admin/order-types` — CRUD типов заказов: создание, поля брифа, прайс-вилки.
- `/admin/email-templates` — редактирование шаблонов email на каждый статус.
- `/admin/orders` — kanban/таблица заявок, переключение статусов, отправка ответа.
- Юзерский flow заявки.

### Этап P6 — AI-провайдеры

- PiAPI или AIMLAPI (выбор после оплаты крипты).
- Реализация `AIProvider` через фактический API.
- Постепенное переключение pipelines с mock на real.

### Этап P7 — Юр-документы и запуск

- Оферта, ПДн, согласие на использование изображения.
- Email-верификация с реальным SMTP.
- Базовое SEO, аналитика.
- Лендинги для трафика по категориям.

## Этап P1 ✅

Миграция `20260506093024_add_data_driven_services`:

- `ServiceCategory` расширен gift-factory категориями: `NOSTALGIA`, `TRENDS_MEMES`, `KIDS_HEROES`, `SPECIAL_OCCASIONS`.
- Существующая модель `Service` расширена полями `pipelineConfig`, `userInputForm`, `priceCoinsStandard`, `priceCoinsPro`, `previewImage`, `previewVideo`, `isFeatured`.
- Существующая модель `Project` используется как generation-equivalent для P1 и расширена полями `pipelineSnapshot`, `selectedTier`, `userInputs`, `stepProgress`.

Реестр блоков:

- Добавлен shared-каталог блоков в `packages/shared/src/blocks` для API/admin UI.
- Исполняемый registry в `apps/worker/src/blocks/registry.ts`.
- 6 стартовых mock-блоков: `image-restore`, `image-upscale`, `image-to-video`, `face-swap-video`, `video-compose`, `text-to-video`.
- API не импортирует worker напрямую: сериализуемая metadata живёт в shared, executors — в worker.

Pipeline-runner:

- `apps/worker/src/pipeline-runner.ts` исполняет линейный `pipelineConfig` сверху вниз.
- Поддержаны плейсхолдеры `{{user.field}}`, `{{step_1.output}}`, `{{step_1.url}}` и tier-select объект `{ standard, pro }`.
- Прогресс шага агрегируется в общий `Project.progress`, состояние шагов сохраняется в `Project.stepProgress`.
- При ошибке runner переводит `Project` в `FAILED` через существующий refund-паттерн `markProjectFailed`.

API:

- `GET /api/admin/blocks` возвращает каталог доступных блоков для будущей админки.
- `POST /api/admin/services/:id/test-run` создаёт zero-cost `Project` с `pipelineSnapshot` и ставит job в новую очередь `service-pipeline`.

Тесты и проверки:

- Добавлено 9 тестов: 2 API (`admin-blocks`) и 7 worker (`blocks-registry`, `pipeline-runner`).
- API: `139 passed`.
- Worker: `7 passed`.
- Всего по API+worker: 146 tests.
- Все builds зелёные, включая root `npm run build`.

Нестандартные решения и долги:

- Отдельную модель `Generation` в P1 не вводили: в текущей Studio v1 уже есть `Project` со статусом, прогрессом, результатами и refund-логикой. Это снижает риск и сохраняет старые 137 тестов.
- Старые очереди `photo-restore`, `photo-animate`, `trend`, `episode` оставлены для обратной совместимости. Новый data-driven flow идёт через `service-pipeline`.
- Seed пока не создаёт реальные gift-factory услуги; это остаётся для P3/P4 вместе с витриной и админкой.

## Этап P2 ✅

Миграция `20260506100420_admin_services_project_service_set_null`:

- `Project.serviceId` сделан nullable с `onDelete: SetNull`, чтобы завершённые проекты выживали при удалении услуги.
- Активные проекты в `PENDING/PROCESSING` всё равно блокируют delete через API.

Backend:

- Добавлен полный CRUD `/api/admin/services`: list/get/create/update/delete/reorder/duplicate.
- `POST/PATCH` принимают multipart `previewImage` и `previewVideo` плюс JSON-поле `data`.
- Добавлены `uploadServiceAssets` и `fileService.uploadServicePreview(...)` для `service-assets/images` и `service-assets/videos`.
- Shared-схема `packages/shared/src/schemas/admin-services.ts` валидирует `pipelineConfig`, `userInputForm`, уникальные step/field id, существование blockSlug и ссылки плейсхолдеров только на user fields или предыдущие шаги.
- PATCH умеет безопасно переключать legacy-сервисы без `pipelineConfig`, чтобы старая Studio v1 база не ломала новый список услуг.

Admin UI:

- Добавлены страницы `/admin/services`, `/admin/services/new`, `/admin/services/[id]`.
- В списке есть фильтры category/status/featured/search, preview thumbnail, цены Standard/Pro, быстрые toggle isActive/isFeatured, reorder, test-run, duplicate и delete.
- Форма услуги содержит секции: основное, превью, цены, pipeline, форма юзера, тестовый прогон.
- Pipeline-конструктор использует `@dnd-kit/core` + `@dnd-kit/sortable`: drag-handle, collapse/expand, динамический рендер параметров по JSON schema блока, model tier-select `{ standard, pro }`.
- UserInputForm builder поддерживает `text`, `textarea`, `photo`, `select`, `avatar`, обязательный единственный `tier` field и live preview.
- Test-run панель запускает `POST /api/admin/services/:id/test-run` и поллит существующий `/api/projects/:id/status`, показывая общий прогресс, `stepProgress`, output и финальный результат.

Тесты и проверки:

- Добавлено 19 API-тестов `admin-services`: auth/admin, validation ошибок pipeline/form, slug collision, create/list/get, filters, update preview cleanup, legacy PATCH, delete blocking/set-null, reorder, duplicate collision.
- API: `158 passed`.
- Worker: `7 passed`.
- Все builds зелёные, включая root `npm run build`.

Долги:

- Frontend component tests не добавлялись: в проекте нет готовой frontend test infra под builder, новую инфраструктуру в P2 не поднимали.
- User-facing витрина и реальный сервисный flow остаются для P3.

## Этап P3a ✅

Seed пилотных услуг:

- Добавлены 4 активные gift-factory услуги через `packages/database/src/seed.ts`:
  - `revive-old-photo` — `NOSTALGIA`, featured, 200/450 коинов.
  - `face-in-trend` — `TRENDS_MEMES`, 250/500 коинов.
  - `kid-cartoon-hero` — `KIDS_HEROES`, featured, 350/700 коинов.
  - `anniversary-card` — `SPECIAL_OCCASIONS`, 300/650 коинов.
- Все услуги сидятся как `Service` с `pipelineConfig`, `userInputForm`, tier-field и snapshot-ready steps.
- Demo-assets локально могут быть пустыми после переустановки Windows, поэтому preview в seed использует fallback `picsum.photos`; рабочие mock-result assets восстанавливаются через `npm run demo:download`.
- Тестовый пользователь `user@allvision.studio / user123` сидится с балансом 25 коинов для проверки недостаточного баланса.

Backend:

- Добавлен публичный router `/api/services`.
- `GET /api/services` отдаёт только активные gift-factory услуги, поддерживает `category` и `featured`, не раскрывает `pipelineConfig`.
- `GET /api/services/:slug` отдаёт деталь услуги и `userInputForm`, но не внутренний pipeline.
- `POST /api/services/:slug/launch` под auth принимает multipart user inputs, валидирует форму, загружает photo-поля в `user-inputs/{userId}/{projectId}`, атомарно списывает `tokenBalance`, создаёт `Project` с `pipelineSnapshot`, `selectedTier`, `userInputs`, `stepProgress` и ставит job в `service-pipeline`.
- При ошибке постановки job проект переводится в `FAILED`, коины возвращаются через `TokenTransaction(reason='refund')`.
- Старый `/api/public/services` оставлен совместимым по типам, но новая витрина использует `/api/services`.

Frontend:

- Добавлен RTK Query slice `servicesApi`: `listServices`, `getService`, `launchService`.
- `/services` переписан под витрину цифровых подарков: hero, featured-блок и 4 категории.
- `/services/[slug]` рендерит preview, описание, tier-selector Standard/Pro, динамическую форму из `userInputForm`, баланс пользователя и запуск через FormData.
- Гость видит CTA входа, пользователь с недостаточным балансом — переход на `/pricing`.
- `/dashboard/projects/[id]` теперь имеет два режима: legacy Studio v1 и data-driven pipeline. Для новых проектов показывает исходные материалы, прогресс каждого шага из `stepProgress`, output шагов и финальный результат.
- В UI используется слово «коины», но нижний слой БД пока сохраняет историческое поле `tokenBalance`.

Тесты и проверки:

- Добавлено 12 API-тестов: `services-public` и `services-launch`.
- Обновлён P2 reorder-тест, чтобы он не зависел от seeded gift services в тех же категориях.
- API: `170 passed`.
- Worker: `7 passed`.
- Root `npm run build` зелёный.

## Этап P3b ✅

Позиционирование и стартовый бонус:

- Главная `/` переупакована под Allvision Studio как AI-фабрику цифровых подарков: hero теперь про выбор повода и формата, а не про AI-промпты.
- Стартовый бонус приведён к продуктовому контракту 25 коинов: `apps/api/src/services/auth-service.ts`, `apps/api/src/__tests__/auth.test.ts`, `.env.example`, локальный `.env` и UI регистрации.
- Для UI добавлен общий справочник gift-factory категорий в `apps/web/src/lib/gift-factory.ts`; нижний слой API/БД по-прежнему использует `tokenBalance`.

Лендинг:

- `apps/web/src/components/landing/HeroSection.tsx` переписан под подарочный flow: CTA `Посмотреть подарки` → `/services`, вторичный CTA `Создать первый бесплатно` → `/register`, текст про 25 коинов.
- Старый `ServicesGrid` заменён на 4 крупные категории: Ностальгия, Тренды и мемы, Дети-герои, Особые поводы. Карточки ведут на `/services?category=<enum>`.
- Под категориями добавлен блок featured-услуг через `useListServicesQuery({ featured: true })`, карточки ведут на `/services/[slug]`.
- `HowItWorks`, `ExamplesGallery`, `Testimonials`, `Pricing`, `FAQ`, `CTA` переписаны под gift-кейсы, Standard/Pro и коины.
- `apps/web/src/lib/public-content.ts`, `PricingCards`, `PricingPageContent` обновлены по текстам и терминологии «коины».

Каталог и дашборд:

- `/services` теперь читает `searchParams.category` на серверной странице и передаёт выбранную категорию в `ServicesCatalog`; каталог использует тот же справочник категорий.
- `/dashboard` больше не показывает legacy quick-start `photo-restore/photo-animate/trends`.
- На главной дашборда добавлены 4 категории подарков и блок `Популярные подарки` через `useListServicesQuery({ featured: true })`; остальные секции (stats, последние проекты/операции, активные заказы, empty-state CTA) сохранены.
- Dashboard/header UI в затронутых местах переведён на «коины»: stat-карточки, sidebar/header top-up CTA, ProjectCard, TransactionRow, billing, character/episode dashboard screens.
- Sidebar-структура не менялась, но подписи приведены к актуальной модели: Кабинет / Проекты / Заказы / Сказки / Биллинг / Профиль. Empty-state страницы заказов/сказок оставлены для P5.

Страница результата генерации:

- `/dashboard/projects/[id]` сохранил legacy Studio v1 рендер без унификации.
- Для data-driven `COMPLETED` проекта добавлен продуктовый result-режим: крупный preview (`video controls` или image с full-screen), кнопки `Скачать`, `Сгенерировать ещё раз` с tooltip `Перегенерация — скоро`, `Поделиться` с mock-диалогом публичной ссылки.
- Под preview добавлен summary: услуга, tier Standard/Pro, дата создания, стоимость, миниатюры исходных материалов.
- Технические `stepProgress` и output шагов спрятаны в `<details>` `Детали генерации`, по умолчанию свёрнуто.
- Для `PENDING/PROCESSING` data-driven проекта сверху показывается общий progress bar из `Project.progress`, сообщение про 2–5 минут и список шагов со статусами/progress из `stepProgress`.
- Для `FAILED` проекта показывается ошибка, сообщение о возврате коинов и кнопка `Попробовать снова` → `/services/[slug]`.

Нестандартные решения и нюансы:

- Реальный regenerate-flow и приватный share-flow не реализованы; кнопки оставлены как product-ready mock по P3b.
- `tokenBalance`, `tokensCost`, `TokenPackage` в коде не переименовывались, только UI-тексты. Переименование в `coinBalance` остаётся P4.
- `GET /api/services` и существующие DTO не менялись: category/featured уже были в `services-api.ts` и `types/public.ts`.
- Root `npm run build` был запущен, но остановился на известном Windows EPERM во время `prisma generate`, потому что локальный dev-процесс держал Prisma engine DLL. Отдельные package builds зелёные.
- API `queue.test.ts` при обычном запуске может быть съеден живым worker из `npm run dev`; финальный API-suite прогонялся с `REDIS_URL=redis://localhost:6379/15`.

Тесты и smoke:

- `npm.cmd run build -w @allvision/shared` — зелёный.
- `npm.cmd run build -w @allvision/api` — зелёный.
- `npm.cmd run build -w @allvision/worker` — зелёный.
- `npm.cmd run build -w @allvision/web` — зелёный.
- API: `170 passed` с `REDIS_URL=redis://localhost:6379/15`.
- Worker: `7 passed`.
- Smoke на свежем API `:4001`: регистрация дала 25 коинов; `/api/account/dashboard` вернул агрегаты; seeded `user@allvision.studio / user123` с 25 коинами получил `402 INSUFFICIENT_TOKENS` на `revive-old-photo` Standard; smoke-пользователь с 1000 коинами запустил `revive-old-photo`, проект дошёл до `COMPLETED`, `stepProgress` содержит 3 шага, результат mp4 скачался (`1128375` bytes). Smoke-пользователь удалён после проверки.

## Этап P6 ✅

Pre-flight и решение по PiAPI:

- Сверены актуальные PiAPI docs: unified task API, Kling create-task, video face-swap, image toolkit/upscale, account info.
- Выяснено, что PiAPI не даёт качественный old-photo restoration endpoint. Решение этапа: `image-restore` остаётся mock до P6.5, кандидат на будущий provider — Replicate GFPGAN или аналог.
- Kling использует `model: "kling"`, `task_type: "video_generation"`, `input.mode: "std" | "pro"`. В P6 это отражено как registry models `kling-std` и `kling-pro`.
- Video face-swap использует `model: "Qubico/video-toolkit"`, `task_type: "face-swap"`; tier'ов нет, поэтому Standard/Pro маппятся на одну модель `qubico-video-toolkit`.
- Для Kling и video face-swap входы нужны как публичные URL, не base64 data-uri. Принято решение использовать Cloudflare R2 для временной публикации input-файлов.

Provider layer:

- Добавлен worker-контракт `apps/worker/src/providers/ai-provider.ts` с `ProviderResult` и методами `imageRestore`, `imageToVideo`, `faceSwapVideo`.
- Добавлен `PiAPIClient` (`createTask`, `getTask`, polling с backoff, HTTP timeout/retry, account info, download provider output).
- Добавлен `PiAPIProvider`: Kling image-to-video, Qubico video face-swap, скачивание результата в LocalFileStorage, metadata `piapiTaskId`, `piapiUrl`, `model`.
- Добавлен `R2TemporaryPublisher`: читает локальный `/static/...` input, `sharp` auto-orient/resize до 2048, JPEG quality 90, uploads в R2 temp prefix.
- `MockAIProvider` расширен новым worker interface; mock-only блоки не требуют PiAPI key.
- `StubAIProvider` добавлен для тестов и `NODE_ENV=test`, обычные тесты не делают сетевых/billable вызовов.
- Старые Studio v1 processors переведены на `getLegacyAIProvider()`, чтобы legacy очереди остались mock.

Защита бюджета и очереди:

- В Prisma добавлена таблица `AIUsageLog` + migration `20260507180000_add_ai_usage_log`.
- Добавлены helpers `usage-limits.ts`: spend за последние 24 часа, daily cap, raw insert/read/delete для `AIUsageLog`.
- PiAPI-вызовы проверяют `PIAPI_DAILY_CAP_USD` и low-balance flag из `/account/info`; при `DAILY_CAP_EXCEEDED`/`LOW_PROVIDER_BALANCE` pipeline fail'ится безопасным UI-сообщением и refund'ом коинов.
- Worker startup fail-fast: без `PIAPI_API_KEY` и R2 env production worker не стартует. Test env остаётся stub.
- `service-pipeline` worker concurrency зафиксирован в `1`.
- Admin `POST /api/admin/services/:id/test-run` ставит job с `mode: "test-run"`; worker использует mock/stub, PiAPI не вызывается.

Блоки, seed и UI:

- `image-to-video` executor переведён на `AIProvider.imageToVideo`, models `kling-std`/`kling-pro`.
- `face-swap-video` executor переведён на `AIProvider.faceSwapVideo`, params `target_video`, `duration`, `estimatedFrames`.
- `image-restore`, `image-upscale`, `text-to-video` остаются mock-compatible через новый provider interface.
- `revive-old-photo` в seed скрыт: `isActive: false`, `isFeatured: false`.
- `face-in-trend` в seed сделан real smoke-услугой: `isActive: true`, `isFeatured: true`, цена 40/40 коинов по себестоимости `$0.48 * 80 ₽/$`, tier оба используют `qubico-video-toolkit`.
- В `face-in-trend` добавлен `trendVideo` select с placeholder public URL'ами. Перед реальным smoke нужно заменить `https://placeholder.example.com/trend-*.mp4` на настоящие публичные R2 URLs и заново выполнить seed.
- `kid-cartoon-hero` и `anniversary-card` переведены на mock `text-to-video`, чтобы не вызывать PiAPI в P6.
- `/dashboard/projects/[id]` для data-driven progress показывает 3–15 минут и в `<details>` выводит `providerCostUsd`/`piapiTaskId` из step output metadata.

Конфигурация и docs:

- Добавлены PiAPI/R2 env keys в `.env.example`, `apps/worker/.env.example`, `apps/api/.env.example`.
- README получил раздел `PiAPI Integration`: переменные, R2 lifecycle, daily cap, balance check, smoke command.
- Добавлен `apps/worker/scripts/smoke-piapi.ts`, запускается только при `RUN_PIAPI_SMOKE=1` и делает реальный Kling smoke.

Тесты и проверки:

- `npx.cmd prisma migrate deploy --schema packages/database/prisma/schema.prisma` — migration применена.
- `npx.cmd prisma generate --schema ...` пробовал запускать, но Windows EPERM сохраняется из-за живого dev-процесса, который держит Prisma engine DLL; код P6 не зависит от нового generated delegate и пишет `AIUsageLog` raw SQL helpers.
- `npm.cmd run build -w @allvision/shared` — зелёный.
- `npm.cmd run build -w @allvision/worker` — зелёный.
- `npm.cmd run build -w @allvision/api` — зелёный.
- `npm.cmd run build -w @allvision/web` — зелёный.
- Worker tests: `10 passed`.
- API tests с `REDIS_URL=redis://localhost:6379/15`: `171 passed`.
- Реальный PiAPI smoke не запускался: нет `PIAPI_API_KEY`, R2 env и настоящих trend-video URL'ов. Это ожидаемо для P6 до ручной настройки.

## Этап P6.5 ✅

Production deploy infrastructure для `allvision-pulse.ru`:

- Добавлены production Dockerfile'ы для `apps/api`, `apps/worker`, `apps/web`. API стартует через `prisma migrate deploy`, затем prod-safe seed, затем `node dist/index.js`; worker-образ содержит `ffmpeg`; web работает через Next.js `output: "standalone"`.
- Добавлен `infra/prod/docker-compose.prod.yml` с PostgreSQL 16, Redis 7, API, worker, web и внутренним nginx на `127.0.0.1:80`. Shared bind mounts: `/opt/allvision-studio/shared/postgres_data`, `uploads`, `public-trends`.
- Добавлен `infra/prod/nginx.prod.conf`: `/api/*` проксируется в API, `/static/trends/*` раздаёт trend-видео, `/static/*` раздаёт user uploads/results, остальное идёт в Next.js.
- Добавлен GitHub Actions workflow `.github/workflows/deploy.yml`: rsync релиза на ВМ, symlink shared `.env`, build, переключение `current`, healthcheck, `previous`, хранение последних 5 релизов, rollback при fail.
- Добавлен `/opt/allvision-studio/scripts/rollback.sh` через repo script `scripts/rollback.sh` и документация `docs/DEPLOY.md`.

Provider/storage:

- `PROVIDER_MODE` стал first-class флагом: `mock` не требует PiAPI/R2 и гонит все блоки через MockAIProvider; `piapi` включает PiAPI для `image-to-video` и `face-swap-video`; `stub` разрешён только в `NODE_ENV=test`.
- Добавлены `LocalPublicPublisher` и `NoopPublisher`, существующий `R2TemporaryPublisher` приведён к общему контракту. Prod default: `STORAGE_PUBLISHER=local`, то есть PiAPI получает URL вида `https://allvision-pulse.ru/static/...` с нашего nginx.
- Worker mount uploads в prod сделан writable, потому что и mock, и PiAPI-провайдеры пишут результат в shared uploads.

Seed и health:

- `packages/database/src/seed.ts` теперь prod-safe: запускается только на пустой БД, требует `ADMIN_INITIAL_EMAIL` и `ADMIN_INITIAL_PASSWORD`, создаёт admin, 4 пилотные услуги, token packages и public settings без destructive операций.
- `packages/database/src/seed-dev.ts` оставлен для локальной разработки: destructive truncate, prod seed, legacy demo catalog и `user@allvision.studio / user123` с 25 коинами.
- `face-in-trend` получает 3 trend-video опции из `${PUBLIC_API_URL}/static/trends/trend-N.mp4`, `previewVideo` указывает на trend-1, `target_video` остаётся `{{user.trendVideo}}`, `isFeatured: true`.
- `/api/health` отдаёт `{ status, version, uptime, providerMode }` без зависимостей; `/api/ready` проверяет PostgreSQL и Redis.

Prod-инфра одним абзацем: DNS Рег.ру ведёт на ВМ, хостовый nginx держит SSL и проксирует `https://allvision-pulse.ru` на `127.0.0.1:80`, где docker nginx направляет `/api/*` в Express API, страницы в Next.js web, static uploads/results и trend-видео из shared volume; worker обрабатывает BullMQ jobs через Redis и пишет результаты в shared uploads, PostgreSQL хранит состояние в shared `postgres_data`.

Известные technical debt: SSL на платном сертификате Рег.ру до миграции на Let's Encrypt в P7, нет автоматических бекапов БД, нет monitoring/alerting, single-VM без failover, SMTP пока mock/email logger, Cloudflare R2 не используется в P6.5.

Проверки P6.5:

- `npm.cmd run build` — зелёный.
- Worker tests: `10 passed`.
- API tests с `REDIS_URL=redis://localhost:6379/15`: `171 passed`.
- `docker compose -f infra/prod/docker-compose.prod.yml build` с `ALLVISION_ENV_FILE=.env.example` — зелёный.
- Runtime import smoke в prod images: `@allvision/shared` и `@allvision/database` загружаются в `prod-api`/`prod-worker`, Next standalone содержит `apps/web/server.js`.

## Этап P6.6 ✅

Prod fixes после первого запуска на `allvision-pulse.ru`:

- Исправлен `readInputUrl`: строковый input теперь возвращается как URL, а не заменяется на `mock://input.jpg`. Баг потенциально затрагивал все блоки, которые читают вход через `readInputUrl`: `image-restore`, `image-upscale`, `image-to-video`, `face-swap-video`; для реального PiAPI критичны `image-to-video` и `face-swap-video`.
- Shared uploads переведены на подход A: prod Dockerfile'ы создают пользователя `allvision` с UID/GID `1000`, чтобы совпадать с owner shared volume на ВМ (`andromeda`). Старый UID `10001`, compose `user:` overrides и one-shot chown service убраны; shared volumes должны принадлежать `1000:1000`.
- Next Image оставлен с явными `remotePatterns` для `picsum.photos`, `fastly.picsum.photos`, `allvision-pulse.ru` и `www.allvision-pulse.ru`. Picsum остаётся временным placeholder-источником из seed; реальные превью услуг через admin UI — технический долг P7.
- Worker prod image во время build запускает `npm run demo:download`, чтобы заполнить `apps/api/demo-assets` для mock-блоков. Выбран этот путь, потому что текущий скрипт уже идемпотентно скачивает/генерирует ассеты и не требует secrets. Дополнительно `MockAIProvider` при пустых video demo-assets генерирует 1-секундный black mp4 через ffmpeg, чтобы `text-to-video`, `image-to-video` mock и `face-swap-video` mock не падали с `DEMO_ASSETS_EMPTY`.

Проверки P6.6: `npm.cmd test -w @allvision/worker` — 19 passed; API tests с `REDIS_URL=redis://localhost:6379/15` — 171 passed; `npm.cmd run build` — зелёный; `docker compose -f infra/prod/docker-compose.prod.yml build` с `ALLVISION_ENV_FILE=.env.example` — зелёный; prod images запускаются под `uid=1000(allvision)`.

Технические долги: заменить picsum preview в seed на реальные брендовые assets; после `sudo chown -R 1000:1000 /opt/allvision-studio/shared/{uploads,postgres_data,public-trends}` убрать временные `chmod 777` на ВМ и держать `uploads/public-trends` в режиме `755`/обычные owner-write права. Hotfix: preview-видео на странице услуги синхронизируется с select-полем формы.

## Этап P7a ✅

Production-grade admin, MediaAsset, image-edit/Nano Banana, usage analytics и UX errors:

- Pre-flight по PiAPI: Nano Banana 2 подтверждён в актуальной документации PiAPI как Gemini endpoint `model: "gemini"`, `task_type: "nano-banana-2"`. P7a использует `prompt`, один входной `image_urls[]`, `output_format`, `aspect_ratio`, `resolution`. Цена Nano Banana 2 в docs: `$0.06` за 1K, `$0.08` за 2K, `$0.12` за 4K. Полей `negative_prompt` и `strength` в PiAPI payload нет; они оставлены в каталоге как compatibility/admin-поля, но PiAPIProvider их не отправляет.
- В Prisma добавлены `MediaAsset` и `Project.errorCode`; миграции `20260509120000_p7a_media_assets` и `20260509193000_media_asset_tags_not_null`. Продовый API container после seed запускает идемпотентный `migrate:media-assets`, который переносит `/opt/allvision-studio/shared/public-trends/trend-{1..3}.mp4` в MediaAsset `kind: "trend-video"`.
- `/admin/media-assets`: CRUD, upload image/video/audio, фильтры, поиск по title/tags, active toggle, delete guard для активных проектов, sortOrder через drag-and-drop и кнопки up/down. Video upload проверяет лимиты до транскода: max 10 sec, max 15 MB; ffmpeg приводит видео к H.264/720p и генерирует thumbnail.
- Добавлен public endpoint `GET /api/public/media-assets?kind=trend-video&active=true` и новый тип поля формы `media-select`. `face-in-trend` в seed теперь выбирает trend-video из MediaAsset, а worker перед запуском pipeline резолвит выбранный MediaAsset id в `publicUrl` для placeholder `{{user.trendVideo}}`.
- Каталог блоков расширен metadata для конструктора: `provider`, `estimatedCostUsd`, descriptions, limits, requiredParams, docsUrl. Admin service form показывает описание модели, cost, limits, provider, docs link и warning при нарушении limits; validation errors для админа стали читаемыми.
- Добавлен блок `image-edit` и worker executor `apps/worker/src/blocks/image-edit.ts`. `AIProvider` получил `imageEdit`; `MockAIProvider`/`StubAIProvider` реализуют его без billable вызовов; `PiAPIProvider.imageEdit` вызывает Nano Banana 2 и сохраняет результат через общий output flow.
- `revive-old-photo` снова активен и featured: Standard 20 coins, Pro 30 coins. Pipeline: `image-edit` Nano Banana 2 -> `image-to-video` Kling -> `video-compose`. Seed prompt в `step_1.params.prompt` специально является `PLACEHOLDER`; после деплоя его нужно заменить в админке на финальный реставрационный промпт.
- `/admin/usage`: summary по `AIUsageLog`, фильтры, day/model/block aggregates, таблица последних логов с раскрытием errorMessage. `/admin/piapi/account` читает баланс PiAPI из API-процесса и кэширует 60 секунд в Redis, в тестах cache memory-only.
- User-facing errors: добавлен `packages/shared/src/errors/user-messages.ts`, `Project.errorCode` сохраняется worker'ом при failed pipeline. `/dashboard/projects/[id]` показывает пользователю friendly message и raw details в collapsed support details; admin видит raw error сразу.
- PiAPI polling timeout снижен до 15 минут для `face-swap-video` и `image-to-video`; для `image-edit` установлен 5-минутный timeout. P7a не делает async-fetch результата после нашего timeout.

Технический долг, оставленный осознанно:

- P7b: async-fetch результатов PiAPI после timeout, pricing calibration себестоимость -> маржа, real test-run в админке.
- P7c: email notifications для failed/completed, юр-документы, реальный SMTP.
- Отложено: замена picsum placeholders на брендовые assets, `tokenBalance` -> `coinBalance`, удаление legacy Studio v1 queues.

Проверки P7a:

- `npx.cmd prisma migrate deploy --schema packages/database/prisma/schema.prisma` — зелёный.
- Worker tests: `23 passed`.
- API tests: `178 passed`.
- Builds: `@allvision/shared`, `@allvision/database`, `@allvision/api`, `@allvision/worker`, `@allvision/web` — зелёные.
- `docker compose -f infra/prod/docker-compose.prod.yml build` — зелёный. В prod Dockerfile'ы добавлены npm fetch retries/timeouts, потому что первые два локальных build-ретрая падали на сетевых `EIDLETIMEOUT`/`ECONNRESET` от registry/prisma engines, а не на ошибках кода.

## Конвенции разработки

- Промпты на этапы пишет ассистент (Claude в чате), исполняет Claude Code.
- После каждого этапа — обновление CLAUDE.md секцией с тем что сделано, нестандартными решениями, итоговыми тестами.
- После каждого этапа — git commit и push.
- Pre-flight перед изменениями обязателен (проверка существующего состояния).
- Mock-first: новые AI-операции сначала через MockAIProvider, потом реальные.

## Известные нюансы

- Windows EPERM на `prisma generate` если запущен dev-сервер — останавливать dev перед БД-операциями.
- `next build` иногда падает с `3221225477` на Windows static worker — повторный запуск проходит, `experimental.cpus=1` в next.config.mjs минимизирует.
- Demo-assets в `apps/api/demo-assets/` не коммитятся, восстанавливаются через `npm run demo:download`. 
## Этап P7.1 ✅

Hotfix prod: cost accuracy, timeout charges, aspect ratio, JWT auth, admin observability.

- PiAPI cost: `PiAPIClient.pollUntilDone()` теперь возвращает `actualCostUsd`; источник факта - `data.meta.usage.consume` из PiAPI `GET /api/v1/task/{taskId}`, пересчитанный как `consume / 10_000_000`. Если PiAPI не вернул стоимость, `PiAPIProvider` пишет `console.warn` с `taskId` и использует прежний estimated fallback.
- Timeout charging: при `PIAPI_TIMEOUT` worker делает финальный `getTask(taskId)`. `completed` логируется как `timeout_charged` с фактической стоимостью и `recoverableOutputUrl` (если PiAPI не вернул стоимость, используется estimated fallback с `console.warn`); `failed` остается `timeout` с `costUsd=0`; `pending/processing` логируется как `timeout_pending` для будущего P7.3 async-fetch. Prisma: добавлено `AIUsageLog.recoverableOutputUrl`.
- Aspect ratio: MediaAsset video transcode больше не приводит trend-video к 1280x720, а сохраняет исходный ratio внутри max 1280. `image-to-video`, `face-swap-video`, `text-to-video`, `image-edit` получили `aspect_ratio: auto | 9:16 | 16:9 | 1:1`; Kling получает `aspect_ratio` в payload, а Qubico face-swap полагается на `target_video`, потому что в публичных docs нет `output_aspect_ratio`/`keep_source_ratio`.
- JWT root cause: access token TTL 15 минут, frontend не делал silent refresh, а Next middleware редиректил при отсутствии `accessToken`, игнорируя живой `refreshToken`. Исправлено: RTK Query baseQuery делает shared silent refresh на 401, middleware пропускает запрос при наличии refresh-cookie, backend логирует issue/verify/refresh с fingerprint токенов, без полного секрета.
- READONLY_ADMIN: Prisma enum `Role` расширен ролью `READONLY_ADMIN`; prod seed идемпотентно создает `READONLY_ADMIN_EMAIL` при заданном `READONLY_ADMIN_PASSWORD`, баланс 0. Login для readonly возвращает Bearer `accessToken` с TTL `READONLY_ADMIN_ACCESS_TTL_MIN`.
- Read-only endpoints: `GET /api/admin-readonly/diagnostics`, `GET /api/admin-readonly/project/:id/full`, `GET /api/admin-readonly/piapi/task/:taskId`. `GET /api/admin-readonly/logs/worker` оставлен как TODO/501 без `WORKER_STDOUT_LOG_PATH`. Middleware допускает `ADMIN` и `READONLY_ADMIN`; mutating methods блокируются, user emails/password/token secrets не отдаются.

Проверки P7.1 локально: `@allvision/database`, `@allvision/shared`, `@allvision/api`, `@allvision/worker`, `@allvision/web` builds зеленые. Полный API/worker test run и `prisma migrate deploy` локально заблокированы тем, что Postgres `localhost:5433` и Docker daemon не запущены в текущем окружении; миграция добавлена как `20260512120000_p7_1_cost_timeout_readonly`.

## Этап P7.1.1 ✅

Hotfix seed для `READONLY_ADMIN`.

- Что было сломано: prod seed мог пропустить создание системных юзеров из-за логики, завязанной на уже заполненный каталог услуг. На проде это проявилось строкой вида `[seed] database already contains 4 services; skipping prod seed`, из-за чего `READONLY_ADMIN` не создавался после добавления env-пароля.
- Что изменили: seed теперь разбит на 4 независимых идемпотентных шага: `ensureSystemUsers()`, `ensureCatalog()`, `ensureTokenPackages()`, `ensureMediaAssetsMigration()`. Каждый шаг логируется отдельно: `step 1/4: system users`, `step 2/4: catalog`, `step 3/4: token packages`, `step 4/4: media assets migration`.
- Гарантия: `ADMIN` и `READONLY_ADMIN` создаются/проверяются до каталога и больше не зависят от количества `Service`. Если `READONLY_ADMIN_PASSWORD` был добавлен уже после первого deploy, следующий seed создаст `claude-readonly@allvision-pulse.ru` даже при полностью заполненном каталоге.
- Безопасность паролей: существующим системным юзерам seed больше не перезаписывает `passwordHash` на каждом deploy. Если юзер уже есть с правильной ролью, пароль не трогается; при несовпадении роли обновляется только роль/`deletedAt`.
- Env: новые имена `ADMIN_EMAIL`/`ADMIN_PASSWORD` поддерживаются как основные, старые `ADMIN_INITIAL_EMAIL`/`ADMIN_INITIAL_PASSWORD` сохранены как fallback для совместимости.
- Тесты: добавлены unit-тесты `packages/database/src/__tests__/seed.test.ts` на пустую БД, повторный запуск с заполненным каталогом, запуск без `READONLY_ADMIN_PASSWORD`, и критический сценарий добавления `READONLY_ADMIN_PASSWORD` между двумя seed-run.
## Этап P7.2 ✅

Model registry/admin expansion:

- Added PiAPI catalog models: `seedance-2`, `seedance-2-fast`, `veo-3.1`, `veo-3.1-fast`, `sora-2`, `sora-2-pro`, `kling-3-std`, `kling-3-pro`, `hailuo-2.3`, `hailuo-2.3-fast`, and `motion-transfer` models `kling-motion-2.6-*` / `kling-motion-3.0-*`.
- Renamed old text-to-video mocks to `veo-3.1-mock` and `seedance-2.0-text-mock`.
- `Kling Avatar` and `Omni Human` were found in PiAPI docs, but not wired into `motion-transfer`: docs describe avatar/lip-sync or image+audio flows, not the requested `input_image + driving_video` dance-transfer payload.
- `AIProvider` gained `textToVideo()` and `motionTransfer()`; `PiAPIProvider` maps Seedance/Veo/Sora text-to-video, Kling/Hailuo image-to-video, and Kling Motion Control.

Admin UI:

- `/admin/services/new` and `/admin/services/:id` now show block descriptions, compatible inputs, examples, model metadata, limits, docs links, and field-level info details in `BlockParamsForm`.
- The service form includes a collapsible pipeline summary with Standard/Pro cost, price, margin, and an explicit negative-margin warning.
- `/admin/services` shows cost/price/margin per service row and colors rows by margin band.
- `/admin/usage` includes PiAPI balance forecast, status segmentation, a `timeout_pending` section, and `$x.xx` cost formatting with exact value in tooltip.
- New `/admin/diagnostics` shows build/API state, queue counts, recent projects/errors, MediaAsset file existence, masked env values, PiAPI balance refresh, and catalog reload action.

Pricing:

- Added `npm run prices:recompute` via `packages/database/src/prices-recompute.ts`.
- Dry-run by default; `--apply` writes `priceCoinsStandard`, `priceCoinsPro`, and legacy `priceTokens`.
- Defaults: `PRICING_MARGIN_DEFAULT=0.8`, `PRICING_USD_TO_RUB=80`; CLI supports `--margin 1.5`; prices round up to 10 coins.

API:

- Added `GET /api/admin/diagnostics/state`, `POST /api/admin/diagnostics/refresh-balance`, `POST /api/admin/diagnostics/reload-services-catalog`.
- Extended readonly endpoints: `GET /api/admin-readonly/services`, `GET /api/admin-readonly/media-assets?kind=trend-video`, `GET /api/admin-readonly/block-catalog`.

Technical debt:

- Sora2 task naming should be smoke-tested before paid Sora services are enabled broadly.
- Worker uptime is `null` in diagnostics until a worker heartbeat is persisted.
- Async-fetch recovery for `timeout_pending` remains P7.3.

## Этап P7.3.1 ✅

Финальная русификация админки:

- Переведены оставшиеся видимые строки в `/admin/diagnostics`, `/admin/usage`, `/admin/services`, `/admin/services/new`, `/admin/services/:id`, `/admin/media-assets`, `/admin/trends`, `/admin/scenario-templates`.
- Валидация пайплайна больше не показывает сырой Zod JSON: пустой pipeline, шаг без блока, битые ссылки на `step_N.output`, невалидные параметры и ошибки `userInputForm` мапятся в человекочитаемые сообщения.
- Сообщения admin API, которые могут попадать в toast, переведены на русский для services, media-assets, trends, scenario-templates, diagnostics/usage balance.

Users/Projects:

- Добавлены полноценные страницы `/admin/users`, `/admin/users/:id`, `/admin/projects`, `/admin/projects/:id`.
- Добавлены admin API: `GET /api/admin/users`, `GET /api/admin/users/:id`, `PATCH /api/admin/users/:id`, `GET /api/admin/projects`, `GET /api/admin/projects/:id`.
- `AdminSidebarNav` теперь ведет на пользователей и проекты без disabled-состояния.
- User endpoints не возвращают `passwordHash`; баланс можно менять только через `tokenBalance`.

Тройная валюта:

- Добавлен общий formatter `formatMoney()` в `packages/shared/src/utils/format-currency.ts`.
- Используется `Setting` с ключом `USD_TO_RUB`; default 80, управление через `GET/PATCH /api/admin/settings`.
- В админке деньги показываются как USD + рубли для себестоимости, коины + рубли для цены, процент + USD + рубли для маржи.
- Курс USD/RUB можно менять в `/admin/diagnostics` в блоке настроек валюты.

Тесты/проверки:

- Добавлены unit-тесты shared для `formatMoney()` и human-readable `validatePipelineConfig`.
- Добавлены API-тесты для `/api/admin/settings`, `/api/admin/users`, `/api/admin/projects`.
- Локально `npm run build`, `npm test -w @allvision/shared`, `npm test -w @allvision/database` проходят.

Technical debt:

- В текущем checkout не было секции `P7.3` и готовых `/admin/users`/`/admin/projects`, поэтому P7.3.1 добавил их заново поверх P7.2.
- DB-backed API/worker тесты локально блокируются, если не поднят Postgres `localhost:5433`/Docker daemon.
- Статусы и технические идентификаторы моделей/блоков остаются raw там, где это осознанные машинные значения для фильтров и диагностики.

## Этап P7.3.2 ✅

SourceSelector в pipeline-конструкторе:

- В `AdminServiceForm` добавлен визуальный `SourceSelector` вместо ручных URL-полей для основного `input` каждого шага и для параметров, помеченных `source-select:<kind>|<label>|<description>`.
- На `SourceSelector` переведены `motion-transfer.input_image`, `motion-transfer.video_url` и `face-swap-video.target_video`; для `image-edit`, `image-restore`, `image-upscale`, `image-to-video` и `video-compose` источник выбирается через общий `input` шага.
- Форматы значений: `{{user.X}}` для поля формы пользователя, `{{step_X.output}}` для результата предыдущего шага, `asset:X` для файла из библиотеки, прямой URL или нестандартный placeholder через расширенный режим.
- Библиотека медиа использует существующие kind'ы: image -> `preview-image`, video -> `trend-video`; новые kind'ы `reference-image`/`reference-video` не добавлялись, чтобы не плодить типы поверх текущего каталога.
- Inline-upload внутри `SourceSelector` отправляет multipart в существующий `POST /api/admin/media-assets`; после успеха новый MediaAsset сразу выбирается как `asset:<id>`.

Motion-transfer:

- Каноническое имя видео-референса в каталоге теперь `video_url`; `driving_video` оставлен как deprecated alias только для старых pipeline snapshots.
- Worker принимает оба ключа: `video_url` и `driving_video`; при старом ключе пишет warning `motion-transfer: driving_video is deprecated, use video_url`, а в PiAPI payload уходит `video_url`.
- При сохранении услуги UI канонизирует `motion-transfer.params.driving_video` в `video_url`, поэтому новые конфиги пишутся только в актуальном формате.

Asset resolution:

- При публичном запуске услуги `asset:<id>` в `pipelineSnapshot` резолвится в стабильный `MediaAsset.publicUrl` до создания Project.
- В `pipeline-runner` добавлен fallback-резолвинг `asset:<id>` перед выполнением pipeline, чтобы вручную созданные или старые snapshots тоже продолжали работать.

Тесты/проверки:

- Добавлены shared unit-тесты для парсинга `{{user.X}}`, `{{step_X.output}}`, `asset:X` и `source-select:<kind>|...`.
- Добавлены worker unit-тесты на `asset:<id>` resolution и backward-compatible `motion-transfer.driving_video`.
- Локально проходят `npm run build`, `npm test -w @allvision/shared -- --runInBand`, `npm test -w @allvision/worker -- --runInBand motion-transfer-block asset-reference`.

Technical debt:

- `SourceSelector` пока читает/загружает только существующие `preview-image` и `trend-video`; если позже понадобится отдельная библиотека reference assets, можно добавить `reference-image`/`reference-video` и расширить выбор kind'ов.
- Для моделей без явных source-параметров источник задается общим `input` шага, поэтому в каталоге не добавлялись фиктивные params вроде `image-edit.input`.

## Этап P8.1 ✅

User library:

- `MediaAsset` расширен полем `ownerUserId` и связью `owner -> User`; system-wide ассеты остаются с `ownerUserId = null`, пользовательские ассеты удаляются каскадно вместе с юзером.
- Добавлены kind'ы `user-avatar` и `user-location` для личной библиотеки пользователя.
- `Project` получил поле `mode`; для генерации образов используется `mode = "library-generation"`, обычные услуги остаются `mode = "service"`, admin test-run пишет `mode = "test-run"`.
- Миграция: `packages/database/prisma/migrations/20260513_user_avatars_locations`.

API:

- Добавлен `GET/POST/PATCH/DELETE /api/user/media-assets` и `GET /api/user/media-assets/:id`; все endpoints требуют auth и возвращают только ассеты текущего пользователя.
- Добавлен `POST /api/user/media-assets/generate`: списывает стоимость Nano Banana из реестра, создает `Project` с одношаговым `image-edit` pipeline и ставит задачу в `service-pipeline`.
- Admin `/api/admin/media-assets` теперь видит user-owned ассеты и возвращает `ownerUserId` + email владельца для модерации.
- Public `/api/public/media-assets` и readonly `/api/admin-readonly/media-assets` отдают только system-wide ассеты (`ownerUserId = null`).

Library generation:

- `image-edit`/`PiAPIProvider.imageEdit()` теперь поддерживают Nano Banana 2 text-to-image без `image_urls`, если input отсутствует.
- `pipeline-runner` переиспользуется без отдельного runner: после успешного `library-generation` pipeline создает `MediaAsset` у пользователя из финального image output.
- Если pipeline падает, существующий `markProjectFailed(... refundTokens: true)` возвращает коины; если очередь недоступна на старте, API сразу помечает проект failed и делает refund.

Security:

- `asset:<id>` в worker резолвится только если ассет system-wide или `ownerUserId === Project.userId`; чужой приватный ассет дает `INVALID_ASSET_ACCESS` и refund.
- User endpoints возвращают 404 для чужих ассетов, чтобы не раскрывать их существование.
- Public service launch резолвит только system-wide `asset:<id>`, чтобы приватный ассет не мог случайно попасть в public snapshot.

Web:

- Добавлена защищенная страница `/studio` с вкладками "Аватары", "Локации", "История генераций".
- На странице можно бесплатно загрузить фото в `user-avatar`/`user-location` и платно создать образ через Nano Banana; после старта генерации юзер переходит на `/dashboard/projects/:id`.
- В сайдбар пользователя добавлен пункт "Студия"; RTK Query слой: `apps/web/src/store/api/user-media-assets-api.ts`.

Tests/checks:

- Добавлены API-тесты для `/api/user/media-assets`, ownership, admin/public visibility и generate/refund сценариев.
- Добавлен worker DB-backed тест post-completion hook для `library-generation`.
- Локально проходят `npm run build`, `npm test -w @allvision/shared -- --runInBand`, `npm test -w @allvision/database -- --runInBand`, `npm test -w @allvision/worker -- --runInBand motion-transfer-block asset-reference`.
- DB-backed API/worker тесты (`user-media-assets`, `admin-media-assets`, `pipeline-runner`) локально не выполняются без Postgres `localhost:5433`; код и типы компилируются.

Technical debt:

- Стоимость Nano Banana берется из текущего model registry; отдельного admin override для library-generation пока нет.
- Локации генерируются как изображения через Nano Banana; video/location generation оставлена на будущие этапы.
- Интеграция аватаров/локаций в Allvision AI чат и услуги остается P8.2/P8.3.

## Этап P8.2 ✅

Allvision AI:

- Добавлена защищенная страница `/ai` с чатовым интерфейсом: история слева, результат генерации справа, sticky-форма запроса снизу.
- Каждый запрос создает отдельный `Project` с `mode = "free-chat"` и одношаговым `pipelineSnapshot`; отдельный runner не добавлялся.
- В пользовательский sidebar добавлен пункт "Allvision AI" рядом со "Студией".

CHAT_MODELS:

- Новый shared-каталог `packages/shared/src/chat/chat-models.ts` ограничивает модели, доступные в свободном чате.
- Image: `nano-banana` через блок `image-edit`, поддерживает text-to-image и optional image reference.
- Video image-to-video: `kling-std`, `kling-pro`, `kling-3-std`, `kling-3-pro`, `hailuo-2.3-fast`, `hailuo-2.3`.
- Video text-to-video: `seedance-2-fast`, `seedance-2`, `veo-3.1-fast`, `veo-3.1`, `sora-2`, `sora-2-pro`.
- `sora-2` и `sora-2-pro` помечены `experimental: true`, потому что P7.2 оставлял smoke-test Sora как технический долг.
- Узкие/служебные блоки исключены из чата: `face-swap-video`, `motion-transfer`, `video-compose`, `image-restore`, `image-upscale`.

API:

- Добавлен `GET /api/user/chat/models` для списка моделей чата.
- Добавлен `POST /api/user/chat/upload`: временная загрузка image/video input в `user-uploads/chat/<userId>/...`, возвращает `chat:<storageKey>`.
- Добавлен `POST /api/user/chat/generate`: валидирует модель, совместимость input, ownership `asset:<id>`, списывает коины, создает `free-chat` Project и ставит job в `service-pipeline`.
- Добавлен `GET /api/user/chat/history?limit&offset`: возвращает только проекты текущего пользователя с `mode = "free-chat"`.
- При ошибке постановки в очередь API помечает проект failed и возвращает коины.

Pipeline-runner:

- `asset:<id>` продолжает резолвиться с P8.1 ownership checks.
- Добавлен resolver `chat:<storageKey>`: принимает только ключи внутри `user-uploads/chat/<Project.userId>/...` и превращает их в public/signed URL перед выполнением pipeline.
- Результат предыдущего чата можно использовать как reference, если URL указывает на `/static/results/<projectId>/...` и проект принадлежит текущему пользователю.

Frontend structure:

- `apps/web/src/components/ai/ChatForm.tsx` — выбор категории, модели, prompt, aspect ratio, duration, стоимость и запуск.
- `apps/web/src/components/ai/InputSourcePicker.tsx` — выбор input из загрузки, личной Студии (`user-avatar`/`user-location`) или system-wide библиотеки сайта (`preview-image`/`trend-video`).
- `apps/web/src/components/ai/ChatHistoryList.tsx` — список последних free-chat проектов.
- `apps/web/src/components/ai/ChatResultView.tsx` — polling статуса, отображение картинки/видео, download и "использовать как референс".
- RTK Query слой: `apps/web/src/store/api/user-chat-api.ts`.

Tests/checks:

- Добавлен shared unit-тест, который проверяет что каждая модель `CHAT_MODELS` реально существует в `BLOCK_CATALOG`.
- Добавлены DB-backed API-тесты для `/api/user/chat/generate`, `/api/user/chat/upload`, `/api/user/chat/history`, refund при queue failure и ownership check для `asset:<id>`.
- Локально проходят `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`, `npm test -w @allvision/shared -- --runInBand chat-models`.
- DB-backed API-тест `npm test -w @allvision/api -- --runInBand user-chat` локально блокируется без Postgres `localhost:5433`, как и другие API DB-backed тесты из P8.1.

Technical debt:

- Multi-turn диалог не реализован: каждый запрос остается отдельным самостоятельным Project.
- Save-to-library результата чата оставлен на будущий этап.
- Cleanup временных `user-uploads/chat/*` файлов пока не реализован; нужен отдельный operational job с TTL 7 дней.
- Text-to-video модели в текущем worker не используют image reference, поэтому в `CHAT_MODELS` они помечены как text-only до отдельной поддержки image-to-video/text+image payload у провайдеров.

## Этап P8.3 ✅

Navigation / 5 pages:

- Финальный пользовательский sidebar: `Главная /`, `Allvision AI /ai`, `Услуги /services`, `Студия /studio`, `Профиль /profile`.
- Старые ссылки "Дашборд", "Биллинг", "Проекты" убраны из основной навигации; история проектов теперь доступна через Студию, баланс и пополнение через Профиль.
- `/dashboard` делает permanent redirect на `/`; `/dashboard/projects/[id]` оставлен как legacy/detail route результата проекта.
- `/dashboard/billing` редиректит на `/profile?tab=billing` с сохранением payment query; `/dashboard/profile` редиректит на `/profile`.

Главная:

- `apps/web/src/app/page.tsx` теперь рендерит гостевой лендинг для неавторизованных и новый пользовательский хаб для авторизованных.
- Авторизованная Главная содержит hero "Привет, <name>", быстрые действия на `/ai`, `/services`, `/studio`, последние 6 проектов, тренды из `MediaAsset kind=trend-video`, featured-услуги и статистику баланса/проектов/списаний.
- Гостевой лендинг сохранен без изменения контента секций.

Profile:

- Добавлена защищенная `/profile` со вкладками: личные данные + пароль, баланс и пакеты коинов, история транзакций/платежей, placeholder email-уведомлений, опасная зона удаления аккаунта.
- Flow пополнения использует существующие token packages и `payments/topup`; mock-payment success/failed теперь возвращает на `/profile?tab=billing`.

Studio avatars in services:

- `userInputForm.photo` получил флаги `allowStudioAvatars` (default true в admin UI/seed) и `allowSystemLibrary` (default false).
- На странице услуги photo/avatar поле умеет: загрузить файл, выбрать `user-avatar` из Студии, опционально выбрать `preview-image` из системной библиотеки.
- При выборе из Студии файл не загружается повторно: в `Project.userInputs[fieldId]` пишется `asset:<id>`, а `inputImages` получает preview URL для истории.
- Server launch проверяет ownership и kind до списания коинов; worker дополнительно резолвит `asset:<id>` в `userInputs`.
- Seed P8.3 включает `allowStudioAvatars: true` для photo-полей услуг `revive-old-photo`, `face-in-trend`, `kid-cartoon-hero`, `anniversary-card`; существующие seed-сервисы патчатся при отсутствии этих флагов.

Save-to-library:

- Добавлен `POST /api/user/media-assets/save-from-project` с body `{ projectId, kind, title, tags?, description? }`.
- Endpoint проверяет ownership проекта, `mode in free-chat/library-generation/service`, `status = COMPLETED`, копирует последний output в `user-uploads/library/<userId>/...` и создает `MediaAsset` без дополнительного списания коинов.
- Кнопка "Сохранить в Студию" добавлена в `ChatResultView` и `/dashboard/projects/[id]` для completed-проектов.
- Studio history показывает `использован аватар: <title>` для проектов, где `userInputs` содержит `asset:<id>`.

Tests/checks:

- Добавлены DB-backed API-тесты для `save-from-project` (ownership, status validation, successful copy) и service launch с `asset:<id>` Studio avatar.
- Локально проходят `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`.
- Локально проходят `npm test -w @allvision/shared -- --runInBand chat-models`, `npm test -w @allvision/shared -- --runInBand admin-services-validation`, `npm test -w @allvision/worker -- --runInBand asset-reference`.
- DB-backed API-тест `npm test -w @allvision/api -- --runInBand user-media-assets services-launch` локально блокируется без Postgres `localhost:5433`, как и прежние DB-backed API-тесты.
- E2E/UI unit для AvatarPicker не добавлялись: в web workspace сейчас нет Playwright/Vitest/RTL test infra.

Technical debt:

- Payments не проверялись реальной картой/ЮKassa sandbox, только существующий flow создания платежа и mock-payment redirect.
- Email-подтверждения и email-уведомления остаются будущим этапом.

## Этап P8.4 ✅

Navigation / shell:

- Пользовательский top-navigation убран для workspace-route'ов; `UserWorkspaceShell` теперь оборачивает авторизованные `/`, `/ai`, `/services`, `/services/[slug]`, `/studio`, `/profile`, `/dashboard/*`.
- Sidebar единый: логотип `Allvision Studio` сверху, 5 ссылок `Главная / Allvision AI / Услуги / Студия / Профиль`, баланс и профиль внизу.
- На mobile `<768px` sidebar скрыт; сверху есть compact bar с бургером слева, балансом и аватаркой справа. Sidebar открывается через Sheet overlay.
- Гостевой лендинг `/`, auth-страницы и админка не используют пользовательский sidebar; админка сохранила свой layout.

Multi-turn Allvision AI:

- Добавлены Prisma модели `Chat` и `ChatMessage`: чат = контейнер, сообщение = пара "запрос + связанный free-chat Project".
- Добавлен `apps/api/src/routes/user/chats.ts`: `GET/POST /api/user/chats`, `GET/PATCH/DELETE /api/user/chats/:id`, `POST /api/user/chats/:id/messages`.
- Создание сообщения переиспользует free-chat project pipeline: списание коинов, `mode = "free-chat"`, queue `service-pipeline`, embedded project state в деталях чата.
- `Chat.updatedAt` обновляется при новом сообщении; первый prompt автоматически становится title чата, если title был `Новый чат`.
- `result:<projectId>` теперь поддержан как reference: API проверяет ownership/completed project и резолвит final output URL для pipeline.
- Старые `/api/user/chat/generate` и `/api/user/chat/history` возвращают `410 CHAT_ENDPOINT_DEPRECATED`; `/api/user/chat/upload` и `/api/user/chat/models` оставлены.

AI UI:

- `/ai` перестроен в двухколоночный multi-turn интерфейс: список чатов слева, активная лента сообщений справа, sticky form снизу.
- Список чатов содержит `+ Новый чат`, поиск, title/date/messageCount и thumbnail последнего результата; на mobile список открывается отдельным Sheet.
- Сообщение показывает prompt, model/aspect/reference badges, progress для queued/processing, media result для completed, error/retry для failed.
- Completed result поддерживает `Скачать`, `Использовать как референс` (`result:<projectId>`) и `Сохранить в Студию`.
- Форма отправляет в `/api/user/chats/:id/messages`; при несовместимой модели и прикрепленном reference показывает warning и блокирует submit.

StylePreset / Studio:

- Добавлена Prisma модель `StylePreset` и seed стартового набора: 6 avatar presets и 6 location presets с английскими generic prompt fragments.
- Добавлен shared helper `buildStylePresetPrompt(presetPrompt, userPrompt)` и unit-test.
- Public API: `GET /api/public/style-presets?kind=user-avatar|user-location`.
- Admin CRUD: `/api/admin/style-presets` и страница `/admin/style-presets` с заголовком "Шаблоны образов".
- `/studio` генерация образа теперь показывает секцию "Шаблоны" + карточку "Без шаблона"; final prompt собирается как `<preset.promptText> <user prompt>`.

Variations:

- `MediaAsset` получил `parentAssetId` с self relation `onDelete: SetNull`: вариации переживают удаление родителя, но связь обнуляется.
- В карточках ассетов Студии добавлена кнопка "Создать вариацию"; flow запускает `library-generation` через `image-edit` Nano Banana с исходным ассетом как `image_input`.
- Новый ассет, созданный worker'ом после `library-generation`, получает `parentAssetId`; карточка показывает количество вариаций.

Tests/checks:

- Добавлены DB-backed API-тесты для `/api/user/chats` CRUD, `/api/user/chats/:id/messages`, deprecated `/api/user/chat/generate|history`, `/api/admin/style-presets` и `/api/public/style-presets`.
- Локально проходят `npm run build -w @allvision/database`, `npm run build -w @allvision/shared`, `npm run build -w @allvision/api`, `npm run build -w @allvision/worker`, `npm run build -w @allvision/web`.
- Локально проходят `npm test -w @allvision/shared -- --runInBand chat-models style-presets` и `npm test -w @allvision/worker -- --runInBand asset-reference`.
- DB-backed API-тест `npm test -w @allvision/api -- --runInBand user-chat user-chats style-presets` локально блокируется без Postgres `localhost:5433`, как и прежние DB-backed API-тесты.

Technical debt:

- Multi-input generation через Kling Elements не делали.
- Email/SMTP, ЮKassa sandbox, cleanup временных chat-upload файлов, NSFW-фильтр, voice messages и streaming остались за рамками P8.4.

## Этап P9 ✅

Pro-default, цены = себестоимость, audio overlay, новые image модели в чате, video effects.

Tier UI и цены (Pro по умолчанию):

- `ServiceDetail.tsx` больше не показывает селектор Standard/Pro и две цены — рендерит одну цену из `priceCoinsPro` ("Стоимость подарка: X коинов"). Поле tier в форме скрыто.
- API `POST /api/services/:slug/launch` всегда выставляет `selectedTier = 'pro'` и списывает по `priceCoinsPro ?? priceCoinsStandard ?? priceTokens`; tier-field в `userInputForm` остаётся опциональным для обратной совместимости.
- Shared schema: `validateUserInputForm` больше не требует ровно одного tier-field; `TIER_FIELD_REQUIRED` заменён на `TIER_FIELD_DUPLICATE` (запрет более одного).
- Admin form: лейблы цен — "Цена Pro, коины (используется фронтом)" и "Цена Стандарт, коины (legacy)". `defaultUserInputForm()` теперь возвращает пустой массив (tier не нужен).

Цены = себестоимость PiAPI (обновлённые seed-услуги):

- `revive-old-photo`: nano-banana@2K + kling-3-pro 5s @720p + ffmpeg compose = $1.38 → **110 коинов**.
- `face-in-trend`: Qubico face-swap (~120 frames) + compose = $0.48 → **40 коинов**.
- `kid-cartoon-hero`: nano-banana@1K стилизация + veo-3.1 8s @1080p + compose = $1.02 → **90 коинов**.
- `anniversary-card`: nano-banana@1K + kling-3-pro 5s @720p + compose = $1.36 → **110 коинов**.
- `priceCoinsStandard === priceCoinsPro` во всех 4 услугах, чтобы UI показывал одну цену.
- `seedPilotServices()` упрощён: вместо custom patch-функций (`needsFaceInTrendP7aPatch`, `needsReviveOldPhotoP7aPatch`, `needsPhotoSourceDefaultsPatch`) используется diff-based update — при изменении seed услуги канонически обновляются на проде.

Audio overlay через video-compose (реальный ffmpeg):

- `apps/worker/src/blocks/video-compose.ts` переписан с pass-through на реальный ffmpeg pipeline:
  - Скачивает input video и `audio_source` URL во временные файлы.
  - `filter_complex` строит цепочку `aloop` (если `audio_loop`), `adelay` (offset), `volume`, `afade` (in/out).
  - При `keep_original_audio=true` микшируется с оригинальным звуком через `amix`; иначе аудио заменяет.
  - `-c:v copy`, `-c:a aac 192k`, `-shortest`, `-movflags +faststart` → результат сохраняется в `outputs/{userId}/{projectId}/{stepId}/result.mp4`.
  - При ошибке скачивания или ffmpeg возвращает оригинальное видео без аудио (fallback) и логирует.
- Catalog `video-compose.paramsSchema` расширен: `audio_source` (sourceSelect:audio), `audio_volume` (0-2), `audio_offset_sec`, `audio_fade_in_sec`, `audio_fade_out_sec`, `audio_loop`, `keep_original_audio`. Старый `music` оставлен legacy.

Новые типы userInputForm:

- `audio` — загрузка mp3/wav/ogg/m4a, до 25 MB. В seed `revive-old-photo` и `anniversary-card` имеют комбинированный режим (upload + library).
- `music-select` — выбор из MediaAsset `kind='background-music'`. API резолвит `asset:<id>` в публичный URL перед запуском pipeline.
- `duration` — кнопки выбора (5/8/10 сек по умолчанию), `durationOptions[]` и `defaultDuration`.
- `aspect_ratio` — кнопки выбора (`auto | 9:16 | 16:9 | 1:1 | 4:3 | 3:4`), `aspectOptions[]` и `defaultAspect`.
- Поддержаны в `ServiceDetail.tsx` (FieldControl + ServiceAudioInput), `AdminServiceForm.tsx` (form builder + кнопки добавления + admin options), shared zod schema, API `services launch`.
- Upload middleware: `uploadServiceLaunchInputs` переведён на отдельный `serviceLaunchMulter` с фильтром image+audio MIME.

Новые image модели в чате (Allvision AI):

- В каталог добавлены: `flux-schnell` (~$0.003), `flux-dev` (~$0.025), `flux-pro-ultra` (~$0.06), `flux-kontext-pro` (~$0.04, image-to-image), `midjourney-v6` (~$0.05, experimental), `hidream-i1-full` (~$0.03), `hunyuan-image-3` (~$0.04). Все с описаниями, docs URLs и limits.
- `PiAPIProvider.imageEdit` рефакторен на `IMAGE_EDIT_MODELS_BY_PROVIDER` mapping + новая функция `buildImageEditPayload`. Поддерживает Nano Banana, Flux txt2img/img2img, Midjourney imagine, HiDream, Hunyuan.
- `CHAT_MODELS` расширен 7 новыми image моделями. Тест `chat-models.test.ts` зелёный — все модели существуют в `BLOCK_CATALOG`.

Video-effect блок и Kling AI Effects:

- Новый блок `video-effect` в catalog с моделями `kling-effects` (~$0.35) и `ai-hugs` (~$0.40). Params: `image_url` (sourceSelect:image), `effect_id`, `prompt`, `duration`, `aspect_ratio`.
- Worker: `apps/worker/src/blocks/video-effect.ts`. Зарегистрирован в `BLOCK_REGISTRY` и `PIAPI_BLOCKS`.
- `AIProvider.videoEffect()` добавлен в interface; реализован в `MockAIProvider`, `StubAIProvider`, `PiAPIProvider`. PiAPI payload: `model: 'kling' | 'Qubico/ai-hugs'`, `task_type: 'effects'`, `input.effect = effect_id`.
- Блок доступен в admin pipeline-конструкторе; конкретные `effect_id` админ задаёт вручную (из PiAPI docs).

Тесты/проверки P9:

- `npm.cmd run build` (root) — зелёный (shared, database, api, worker, web).
- `npm.cmd test -w @allvision/shared -- --runInBand` — 20 passed, 5 suites.
- `npm.cmd test -w @allvision/worker -- --runInBand --testPathIgnorePatterns="pipeline-runner|piapi-provider"` — 32 passed, 10 suites.
- `blocks-registry.test.ts` обновлён под 9 блоков (добавлен video-effect).
- DB-backed pipeline-runner и piapi-provider тесты блокируются Postgres `localhost:5433`, как и в предыдущих этапах.

Технические долги P9:

- Реальные `task_type` и payload format для Flux Schnell/Dev/Pro, Midjourney v6, HiDream, Hunyuan Image 3 нужно smoke-протестировать перед публичным запуском новых image моделей в чате — публичные PiAPI docs не всегда точно отражают runtime API.
- PiAPI templates (`video-effect`) добавлены как infrastructure, но конкретные `effect_id` (hug, kiss, dance, balloon explosion и т.п.) не зашиты в каталог. Следующий этап — UI выбора из списка эффектов в admin form и chat.
- Audio файлы пользователей оседают в `user-uploads/user-inputs/...` без TTL-cleanup; нужен периодический job.
- В Studio (`/studio`) не добавлена возможность сохранения пользовательских audio-треков как MediaAsset — пока user audio только разовый upload на услугу.
- ServiceDetail.tsx: `description` `Недостаточно токенов` toast и пара legacy строк всё ещё используют «токены» вместо «коинов»; косметика без функциональной разницы.

## Hotfix P9.1 ✅ — GPT Image 2 timeout

Симптом: услуги на `gpt-image-2` (`single-photo-2017` «Фото в стиле 2к17», `group-photo-2017`) падали на сайте с `PIAPI_NETWORK_ERROR` («Не удалось связаться с AI-провайдером»), хотя в дашборде PiAPI задачи показывались как `Success` — причём по нескольку успешных генераций подряд за один пользовательский запуск.

Причина: GPT Image идёт синхронным OpenAI-совместимым запросом (`/v1/images/generations|edits`), ответ приходит только после генерации изображения. Это регулярно дольше дефолтных 30s `requestTimeoutMs`. `AbortController` рвал соединение, `fetchWithRetry` повторял запрос (`TRANSIENT_RETRIES = 3`), каждый повтор создавал новую успешную (и платную) генерацию на стороне PiAPI, а worker в итоге кидал `PIAPI_NETWORK_ERROR` и возвращал коины.

Фикс (`apps/worker/src/providers/piapi-client.ts`):

- Добавлен отдельный `gptImageTimeoutMs` (env `PIAPI_GPT_IMAGE_TIMEOUT_MS`, по умолчанию `180000`); синхронные GPT Image вызовы используют его.
- `fetchWithRetry` получил per-call опции `{ timeoutMs, retries }`; GPT Image зовётся с `retries: 1`.
- Наш собственный таймаут (`AbortError`) теперь не повторяется, а сразу превращается в `PIAPI_TIMEOUT` — чтобы не плодить дублирующие платные генерации.
- `PIAPI_GPT_IMAGE_TIMEOUT_MS` добавлен в `apps/worker/.env.example` и `infra/prod/.env.example`.

Seed не трогался: услуги `single-photo-2017` / `group-photo-2017` уже корректно используют `gpt-image-2`.

Проверки: `npm.cmd run build -w @allvision/worker` — зелёный; `npm.cmd test -w @allvision/worker -- --runInBand piapi-client` — 5 passed (добавлен тест на no-retry при abort); `blocks-registry asset-reference motion-transfer-block` — 8 passed.

## Этап P9.2 ✅ — Кинематограф: перенос в сцену + возврат tier-выбора

4 новые услуги «перенос себя в фильм/мультфильм» + восстановление пользовательского выбора Standard/Pro.

Новый блок `scene-transfer`:

- Помещает 1–2 людей с фото в референс-сцену, которая может быть **фото-кадром ИЛИ видео-референсом** (`scene_mode: photo|video`). Это обобщение `trend-video-transfer` (тот работает только по видео).
- Standard собирает на `kling-3-omni` (Kling 3.0 Omni: `images[]` + `video`), Pro — на `seedance-2-omni` (Seedance 2.0 Omni: `image_urls[]` + `video_urls[]`). Движок определяется по резолвнутому tier-моделью slug'у (`model: { standard: 'kling-3-omni', pro: 'seedance-2-omni' }` → runner резолвит в строку → блок роутит по `includes('seedance')`).
- Фото-сцена добавляется отдельным image-референсом в конец `images`/`image_urls` (anchor `@image_N`/`@imageN`); видео-сцена идёт в `video`/`video_urls` (anchor `@video`/`@video1`).
- Промпт собирается в `buildScenePrompt`: скрытый admin `base_prompt` + авто-anchor сцены + авто-блок под 1 или 2 персонажей (это и есть «2 промпта под капотом») + `user_prompt` (или `default_user_prompt`, если пользователь ничего не ввёл) + хвост про качество/без вотермарка. Anchors разные под Kling/Seedance.
- Опциональная мультяшная стилизация: при `stylize_characters: true` каждое фото персонажа прогоняется отдельно через `gpt-image-2` (`stylize_prompt`) ДО видео-шага; результаты становятся identity-референсами. Один человек — один вызов, два — два (оптональный второй обрабатывается только при наличии).
- `people_count: auto` определяет 1/2 по наличию `secondary_photo` (на рантайме `{{user.person2}}` резолвится в undefined, если фото не загружено).
- Reuse провайдерных методов `textToVideo`/`imageEdit` (mock/stub/piapi) — новых методов в `AIProvider` не добавлялось. Блок зарегистрирован в `registry.ts` и в `PIAPI_BLOCKS`.

4 услуги в seed (`giftFactoryServices`), все с tier-выбором Standard (Kling 3.0) / Pro (Seedance 2.0):

- `me-in-movie` «Я в фильме» (CINEMA, инструмент): пользователь выбирает режим «По фото»/«По видео» (`scene_mode`), грузит scene_photo ИЛИ scene_video, person1 (обяз.) + person2 (опц.), свой `prompt` (опц.). Standard 120 / Pro 199.
- `me-in-cartoon` «Я в мультфильме» (CINEMA, инструмент): то же + `stylize_characters: true` (gpt-image-2). Standard 140 / Pro 219.
- `kid-in-blue-tractor` «Ребёнок в мультике Синий трактор» (KIDS_HEROES, шаблон): пользователь грузит только person1/person2; сцена и base_prompt зашиты админом (PLACEHOLDER `scene_image`), `stylize_characters: true`, без поля промпта. Standard 140 / Pro 219.
- `me-in-harry-potter` «Я в сцене „Гарри Поттер“» (CINEMA, шаблон): как выше, но live-action (без стилизации). Standard 120 / Pro 199.
- Имена услуг-шаблонов сделаны буквально по запросу пользователя; это РАСХОДИТСЯ с IP-стратегией CLAUDE.md (свои стилизованные миры) — осознанный выбор владельца, юр-риск на нём. Референсы сцен — picsum-плейсхолдеры (`image('cinema-*')`), владелец заменит на реальные кадр/видео и допишет промпты в админке.
- Категория «Кинематограф» (`CINEMA`) добавлена миграцией `20260605120000_cinema_category` в `ServiceCategoryDef` (icon `Film`, sortOrder 5). `kid-in-blue-tractor` оставлен в `KIDS_HEROES` для дискаверабилити; остальные 3 — в `CINEMA`. Перемещается через `/admin/services`.

Возврат выбора Standard/Pro (после P9, где tier-селектор был убран):

- Сделано обратносовместимо: селектор и две цены показываются ТОЛЬКО когда в `userInputForm` услуги есть поле `tier`; услуги без него остаются в P9-логике «только Pro по `priceCoinsPro`».
- `ServiceDetail.tsx`: новый `TierSelector` (две карточки с ценами `priceCoinsStandard`/`priceCoinsPro`), `tier` в стейте (default `standard`), цена и кнопка зависят от выбранного tier, выбранный tier уходит в FormData.
- `POST /api/services/:slug/launch`: читает значение tier-поля → `selectedTier` (`standard`|`pro`) и списывает `priceCoinsStandard`/`priceCoinsPro` соответственно. Без tier-поля — прежний Pro-default. `selectedTier` уже корректно резолвит tier-объекты (`{standard,pro}`/`{{tier_model}}`) в pipeline-runner.

Условная обязательность полей формы (`requiredWhen`):

- В `userInputFieldSchema` добавлено `requiredWhen?: { field, value }`: поле обязательно, когда другое поле имеет заданное значение. Используется для `scene_photo` (обяз. при `scene_mode=photo`) и `scene_video` (обяз. при `scene_mode=video`), т.к. условного показа полей в форме нет.
- Учитывается и на сервере (`fieldRequired` в `services.ts`), и на клиенте (`fieldIsRequired` в `validateClient`).
- В `ServiceDetail` фото-поля теперь группируются по `mediaGroup`: персонажи (без группы) — в общий «Референсы N/M» пикер, `scene_photo` (mediaGroup `scene`) — отдельным аплоад-полем, чтобы кадр сцены не смешивался с лицами.

Загрузка услуг в prod (важно): коммит `52073ac` отключил сидирование услуг на проде (`ensureCatalog` рано выходит при `!includeDevCatalog`), из-за чего `giftFactoryServices` перестали попадать в прод через `node packages/database/dist/seed.js` (prod CMD = `prisma migrate deploy && seed.js && ...`). В P9.2 добавлен **create-only** загрузчик `ensureGiftServices()`, вызываемый в `runSeed()` безусловно. Он создаёт ТОЛЬКО услуги из явного allowlist'а `NEW_SERVICE_SLUGS_TO_CREATE` (4 новые слуга P9.2), и только если их нет в БД. НИКОГДА не апдейтит/не удаляет существующие и НЕ пересоздаёт удалённые админом услуги — каталог управляется через `/admin/services`, лишнее админ удаляет осознанно. При следующем батче услуг: добавить их слуги в allowlist на этот деплой, потом очистить список. Тест-гард P7.1.1 обновлён под контракт: create-allowlisted-missing-only + never-update + идемпотентность. Категория `CINEMA` приезжает миграцией `20260605120000_cinema_category`.

## Этап P9.2.1 ✅ — Хотфиксы scene-transfer (фильм/мультфильм)

- **Баг «Я в мультфильме» (PIAPI_NETWORK_ERROR):** стилизация мультяшек шла через `gpt-image-2` (синхронный OpenAI-эндпоинт, нестабильный — см. P9.1). «Я в фильме» (omni без gpt-image) работал → проблема в самом вызове gpt-image. Стилизация переведена на `nano-banana` (асинхронный unified task API, тот же, что в чате — проверенно стабилен). Дефолт `stylize_model` в блоке тоже `nano-banana`.
- **Условный референс сцены:** добавлены `visibleWhen` (видимость поля по значению другого) и `defaultValue` в `userInputFieldSchema`. Для услуг-инструментов: `scene_mode` по умолчанию `photo`; `scene_photo` виден только при `photo`, `scene_video` — только при `video`. `ServiceDetail` фильтрует скрытые поля (в т.ч. в группах фото) и в рендере, и в `validateClient`; дефолты префиллятся на загрузке услуги.
- **Длительность:** в режиме «По фото» добавлено поле `duration` (5/8/10/15 сек, видимо только при `photo`). В режиме «По видео» длина берётся из видео-референса: блок `scene-transfer` пробит длительность через `ffprobe` (clamp 3–15 сек, фолбэк при ошибке; в `NODE_ENV=test` ffprobe пропускается). Шаблоны тоже получили поле `duration`.
- **Pro временно выключен:** в `option` формы добавлен флаг `disabled`. `TierSelector` рендерит такие опции серыми/некликабельными («скоро»). У всех 4 услуг Pro (Seedance 2.0) помечен `disabled`, оставлен только Стандарт (Kling 3.0); модель в pipeline осталась `{ standard: 'kling-3-omni', pro: 'seedance-2-omni' }` — чтобы включить Pro позже, достаточно снять флаг.
- **Загрузка изменений в прод:** `ensureGiftServices` теперь **upsert** для allowlist-слугов (`NEW_SERVICE_SLUGS_TO_CREATE`): создаёт отсутствующие и обновляет уже созданные 4 услуги до канонического seed-конфига (они активно дорабатываются и ещё не правились в админке). Всё ВНЕ allowlist'а по-прежнему не трогается (удалённые админом услуги не возвращаются). Когда услуги стабилизируются — очистить allowlist. Тест-гард обновлён: на втором прогоне create не вызывается, count стабилен, allowlisted refresh'атся.

## Этап P9.2.2 ✅ — Фиделити персонажа в мультсцене + clean-face в Студии

- **Промпт переноса персонажа.** В блок `scene-transfer` добавлен param `character_prompt` (admin, скрыт): отдельная инструкция о том, КАК переносить человека — фотореализм, чёткое соблюдение лица из референса, естественная интеграция в сцену (масштаб, контактная тень, свет, не плоский cutout) и человеческое движение без мультяшных кривляний. Вшит в `buildScenePrompt` после блока идентичности. У мультуслуг (`me-in-cartoon`, `kid-in-blue-tractor`) `base_prompt` переписан так, что мультстиль применяется к ФОНУ/окружению, а не к человеку, плюс задан сильный `character_prompt`. Это решает кейс «ребёнок получается кривой мультяшкой / плоско вклеен».
- **Студия: движок GPT Image 2 для clean-face.** `POST /api/user/media-assets/generate` принимает `model: nano-banana | gpt-image-2` (стоимость по модели, у обеих ~10 коинов). В `/studio` в модалках «Создать образ» и «Создать вариацию» для `user-avatar` добавлен переключатель движка (`AvatarModelPicker`): «Стандарт (Nano Banana)» / «Чёткое фото (GPT Image 2)». Добавлен StylePreset `avatar-clean-face` («Чёткое фото для анимаций») с промптом под резкое фронтальное лицо крупным планом, ровный свет, нейтральный фон — как качественный референс для будущих анимаций. Идея: юзер делает clean-face в Студии и подставляет его в услуги переноса → лучше держится личность.

Проверки P9.2/P9.2.1/P9.2.2: `npm.cmd run build` для shared/worker/api/web/database — зелёные; `npm.cmd test -w @allvision/shared` — 20 passed; `npm.cmd test -w @allvision/database -- seed` — 4 passed; worker `blocks-registry trend-video-transfer-block scene-transfer-block motion-transfer-block asset-reference text-to-video-block image-edit-block blocks-utils piapi-payloads piapi-provider-kling-omni` — 42 passed (добавлен `scene-transfer-block.test.ts`, 5 тестов; `blocks-registry` обновлён под 12 блоков). DB-backed `pipeline-runner`/`piapi-provider` локально не гоняются без Postgres `localhost:5433`.

Технический долг P9.2:

- Реальный PiAPI-смоук Kling 3.0 Omni / Seedance 2.0 Omni с фото-сценой (image как часть `images`/`image_urls` + @image_N anchor под локацию) не прогонялся — нужен перед платным запуском; payload-формат повторяет уже рабочие omni-вызовы из `trend-video-transfer`/`last-kiss-meteor`.
- Плейсхолдер-сцены (`cinema-blue-tractor-scene`, `cinema-hp-scene`) и picsum-превью заменить на реальные брендовые ассеты; финальные base_prompt'ы шаблонов дописать в админке.
- Для шаблонов сцена пока только photo-mode; admin может переключить `scene_mode: video` + `scene_video` (URL/asset) вручную.

## Этап P9.3 ✅ — Мульти-вывод + услуга «Карусель для поста»

GPT Image fix: `quality` для gpt-image-1/2 нормализуется (`normalizeGptImageQuality`): валидные `auto|high|medium|low`, `standard → medium`, остальное → `auto`. Раньше слали `standard` (значение DALL·E-3) → PiAPI HTTP 400 → общий «техническая ошибка» в Студии. Чинит Студию (GPT Image) и карусель.

Мульти-вывод проекта:
- `Project.resultAssets Json?` (миграция `20260605200000_project_result_assets`) — массив `{ type, url }` для услуг с несколькими результатами.
- `pipeline-runner.normaliseFinalOutput` детектит `output.metadata.slides` (массив URL) и пишет в `resultAssets` (+ `resultImage`/`resultVideo` = первый как обложка). Обычные одно-результатные услуги не затронуты.
- `resultAssets` добавлен в project list/status DTO; web `ProjectStatusResponse`/`ProjectListItem`.
- `ServiceDetail` показывает галерею слайдов (`GenerationGallery`) для завершённого проекта с `resultAssets.length > 1`: сетка превью + скачать каждый.

Блок `carousel-slides`:
- Вход: 1 фото человека + массив текстов слайдов + единый `style_prompt`. На каждый слайд — отдельный вызов GPT Image 2; первый слайд становится style-референсом для остальных (`image_urls`), чтобы палитра/типографика/сетка не «прыгали». Текст слайда рендерится прямо в изображение. Выход: `{ type:'image', url: slides[0], metadata:{ slides:[...] } }`.
- Зарегистрирован в `registry.ts` и `PIAPI_BLOCKS`; `blocks-registry` тест под 13 блоков; добавлен `carousel-slides-block.test.ts` (3 теста).

Поле формы `slides`:
- Новый тип поля `slides` (+ `maxSlides`) в `userInputFieldSchema`. `ServiceDetail.SlidesInput`: селектор числа слайдов (1..max) + динамические textarea на каждый слайд; значение хранится как JSON-массив строк; на сабмите конвертируется в массив в payload.
- Launch валидирует `slides` (массив 1..maxSlides) и кладёт массив в `userInputs`; pipeline берёт `{{user.slides}}`.

Послайдовая цена:
- Услуги со `slides`-полем тарифицируются за слайд: `tokensCost = ценаTier × числоСлайдов` (launch), и цена в UI live-обновляется с числом слайдов.

Услуга `carousel-post` («Карусель для поста», TRENDS_MEMES, 15 коинов/слайд, gpt-image-2, до 10 слайдов) добавлена в seed и в allowlist `NEW_SERVICE_SLUGS_TO_CREATE` (upsert на деплое).

Проверки P9.3: билды shared/database/worker/api/web — зелёные; worker `blocks-registry scene-transfer-block carousel-slides-block` — passed (добавлен carousel тест, registry под 13); shared 20 / seed 4 — passed; `validatePipelineConfig` для carousel-post — OK.

Технический долг P9.3: variable-цена реализована частным случаем по наличию `slides`-поля (не общий механизм); карточка товара (LLM + условная генерация + 4 разнородных вывода) — следующий этап (LLM отложён по решению владельца, промпты пока ручные).

## Этап P9.4 ✅ — Услуга «Карточка товара» (условный мульти-вывод)

Блок `product-card` (один блок = условный роутер, как trend-video-transfer):
- Вход: 1–3 фото товара (`photo1` обяз. + `photo2/3` опц.), `product_name`, массив `outputs` (галочки).
- Условно генерирует только выбранное и возвращает **лейблованный мульти-вывод** `metadata.assets = [{type,url,label}]`:
  - `cover` — обложка (gpt-image-2 по фото).
  - `animation` — лёгкая анимация товара (image-to-video, по умолчанию kling-3-pro; вход — обложка, если она есть, иначе photo1).
  - `ad` — рекламный ролик (seedance-2-omni, `image_urls` = фото товара).
- `description` пока недоступен (нужна текстовая модель) — в форме это отключённая галочка «скоро».
- Промпты обложки/анимации/рекламы имеют дефолты в блоке + admin-переопределение (`cover_prompt`/`animation_prompt`/`ad_prompt`), `product_name` подставляется. Зарегистрирован в `registry.ts` и `PIAPI_BLOCKS`; `blocks-registry` под 14 блоков; `product-card-block.test.ts` (4 теста).

Лейблованный мульти-вывод:
- `pipeline-runner.normaliseFinalOutput` теперь сначала читает `metadata.assets` (массив `{type,url,label}`) → `resultAssets` с лейблами; затем `metadata.slides` (P9.3). Обложка = первый ассет.
- `GenerationGallery` показывает лейбл («Обложка»/«Анимация»/«Реклама») вместо номера, если он есть.

Поле формы `multiselect` (галочки):
- Новый тип `multiselect` + у опций `priceCoins`/`disabled`/`hint`. `MultiSelectInput`: чекбоксы, disabled-опции серые («скоро»), цена на опцию. Значение — JSON-массив выбранных, на сабмите конвертируется в массив.
- Launch валидирует `multiselect` (массив из разрешённых, не-disabled значений; required → ≥1).

Пооутпутная цена:
- Если есть priced `multiselect`-поле, `tokensCost = сумма priceCoins выбранных опций` (launch), и цена в UI live-суммируется. Карточка товара: cover 15 / animation 60 / ad 120 коинов.

Услуга `product-card` («Карточка товара», TRENDS_MEMES, default галочка cover) добавлена в seed и allowlist.

Проверки P9.4: билды shared/database/worker/api/web — зелёные; worker `blocks-registry product-card-block carousel-slides-block scene-transfer-block` — passed (registry под 14, +`product-card-block.test.ts` 4 теста); shared/seed — passed; `validatePipelineConfig` для product-card — OK.

Технический долг P9.4: описание товара ждёт LLM (галочка disabled); пооутпутная/послайдовая цена — частные случаи в launch и UI (по наличию `multiselect`/`slides` поля), не общий движок; реальный PiAPI-смоук Seedance-omni для рекламы товара и kling-3-pro анимации не прогонялся.

## Этап P9.4.1 ✅ — Фикс GPT Image 2 (референсы) + сплит карточки товара

GPT Image 2 настоящая причина (PIAPI_NETWORK_ERROR в услугах, хотя на PiAPI задачи проходят, а в чате gpt-image работает):
- Edits-эндпоинт `/v1/images/edits` (multipart, поле `image`) требует, чтобы БАЙТЫ референса держал сам воркер. Раньше воркер HTTP-скачивал входной `/static`-URL (`this.client.download(publicUrl)`) — а изнутри контейнера достучаться до собственного публичного домена не получается (loopback падает) → PIAPI_NETWORK_ERROR. Nano Banana и чат работают, потому что там воркер ПУБЛИКУЕТ URL, а скачивает его PiAPI, не воркер.
- Фикс: `PiAPIProvider.readImageRefBytes(url)` — для своих `/static/<key>` URL читает файл напрямую из общего локального тома uploads (`UPLOADS_DIR`), а не по HTTP; для внешних URL остаётся `client.download`. `generateGptImage` теперь принимает `images: {buffer,contentType}[]` вместо `imageUrls`.
- Документация PiAPI (https://piapi.ai/docs/gpt-image/gpt-image-api) подтвердила: endpoint/multipart/Bearer — верны; quality допускает `low|standard|high|auto`. Поэтому `normalizeGptImageQuality` исправлен: `standard` валиден (раньше ошибочно мапили в `medium`, которого в списке нет), `medium → high`, прочее → `auto`.

Карточка товара разделена на 2 услуги (общий блок `product-card`):
- В блок добавлены аддитивные пользовательские стили `cover_style`/`animation_style`/`ad_style`: добавляются к базовому admin-промпту, не заменяя каркас. Так каркас «снять рекламу по референсу» остаётся под капотом, а юзер пишет только стиль.
- `product-cover` («Обложка товара»): фото 1–3 + название + `multiselect` [cover 15 / animation 60]. Обложка GPT Image 2, опц. лёгкая анимация (kling-3-pro). Цена за выбранное.
- `product-ad` («Рекламное видео товара»): фото 1–3 + опц. название + `style` (textarea, пусто → дефолтный стиль) + формат + длительность. В pipeline `outputs: ['ad']` зашит, `ad_style: '{{user.style}}'`, `ad_model: seedance-2-omni`. Фиксированная цена 120. Юзер не пишет «сделай видео по референсу» — каркас в блоке.
- Комбинированная `product-card` переведена в `isActive:false` (скрыта), оставлена в seed/allowlist чтобы upsert деактивировал её на проде. `product-cover`/`product-ad` добавлены в allowlist.

Проверки P9.4.1: билды shared/database/worker/api/web — зелёные; worker `piapi-client product-card-block carousel-slides-block blocks-registry image-edit-block` — 17 passed; shared/seed — passed; `validatePipelineConfig` для product-cover/product-ad — OK.

## Этап P9.4.2 ✅ — GPT Image sync эндпоинт ненадёжен -> услуги на Nano Banana

Диагностика по проду (SSH worker-логи): после фикса P9.4.1 скачивание референса больше не падает; теперь падает САМ вызов `generateGptImage` → `fetchWithRetry` с `PIAPI_NETWORK_ERROR: fetch failed`. Ручной `fetch` к `https://api.piapi.ai/v1/images/generations` из контейнера воркера ВИСНЕТ (нет ответа). Вывод: синхронный OpenAI-совместимый эндпоинт gpt-image держит соединение на всю генерацию, и оно рвётся (NAT/gateway long-connection drop) — при этом createTask-модели (nano-banana, omni) отвечают мгновенно и поллятся, поэтому работают. Доки PiAPI (сверены) не дают async/task-API пути для gpt-image — только синхронные `/v1/images/*`.

Решение: услуги переведены с `gpt-image-2` на `nano-banana` (async unified task API, проверенно стабилен):
- `carousel-slides` блок default модель и `carousel-post` seed → `nano-banana`.
- `product-card` блок cover default и `product-cover` seed `cover_model` → `nano-banana`.
- Студия: `AvatarModelPicker` по умолчанию уже `nano-banana`; опция GPT Image помечена «(бета)» с предупреждением о сбоях провайдера.
- В `PIAPI_NETWORK_ERROR` добавлен `cause` (ECONNRESET/UND_ERR/…) для будущей диагностики.

gpt-image остаётся выбираемой моделью в каталоге/админке (вдруг провайдер починит/через другой egress), но дефолты услуг — nano-banana. Технический долг: услуги `single-photo-2017`/`group-photo-2017` всё ещё на `gpt-image-2` (не в allowlist, меняются в админке); если будут падать — переключить на nano-banana в `/admin/services`. Для точного текста на слайдах карусели (слабое место nano-banana) — на будущее overlay текста через ffmpeg/canvas.

Проверки P9.4.2: билды shared/database/worker/api/web — зелёные; worker `carousel-slides-block product-card-block piapi-client blocks-registry` — 14 passed; seed — passed.

## Этап P9.4.3 ✅ — Фикс gpt-image EDIT (ECONNRESET на 15с)

Диагностика по проду: ручной тест показал, что gpt-image GENERATION (JSON) доживает до ~60с и возвращает 200, а EDIT (multipart `/v1/images/edits`) стабильно падает `ECONNRESET` на ~15с — для обоих имён модели (gpt-image-2 и gpt-image-2-preview), значит дело не в имени. JSON пережил 60с простоя → это не общий idle-таймаут, а специфика того, как fetch/undici шлёт multipart (поток без чистого Content-Length, шлюз рвёт на 15с).

Фикс (`PiAPIClient.gptImageEditViaHttps`): edit-запрос теперь идёт через встроенный `node:https` — multipart собирается в один Buffer и отправляется с явным `Content-Length` (как JSON-генерация, не chunked/streamed) + TCP keepalive (`socket.setKeepAlive(true, 10s)`). Generation остался на fetch (работает). Без новых зависимостей (undici в Node 22 не requireable из CJS). gpt-image остаётся в чате Allvision AI и услугах 2к17 для теста; если edit заработает — вернём gpt-image в карусель/обложку (сейчас они на nano-banana).

Проверки P9.4.3: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client blocks-registry` — 7 passed.

## Этап P9.4.4 ✅ — gpt-image edit: ретраи на ECONNRESET (интермиттентный обрыв)

Лог чата: edit идёт через https-путь (P9.4.3), но иногда падает `gpt-image edit: read ECONNRESET`. При этом часть задач завершается (job 94 — 96с успех) → обрыв **интермиттентный**. Причина: Node `setKeepAlive(enable, delay)` задаёт только начальную задержку (TCP_KEEPIDLE), а интервал (TCP_KEEPINTVL) остаётся OS-дефолтным (~75с), поэтому после первого keepalive-зонда возникает длинный простой и шлюз рвёт соединение во время ожидания ~60-100с ответа.

Фикс: `gptImageEditViaHttps` теперь оборачивает `gptImageEditOnce` в ретраи (до 4 попыток) именно на connection-reset (`ECONNRESET|socket hang up|EPIPE|ETIMEDOUT|ECONNREFUSED`); каждая попытка — свежее соединение с keepalive (начальный зонд снижен до 5с). Так как обрыв интермиттентный, несколько попыток обычно дают успешную. Прочие ошибки (HTTP 4xx, timeout) не ретраятся. Минус: при обрыве PiAPI мог успеть сгенерировать (списание у провайдера), так что ретраи могут стоить лишних генераций в флапающие периоды — это плата за работоспособность edit; пользовательские коины при этом не дублируются (одна job).

Проверки P9.4.4: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 5 passed.

## Этап P9.4.5 ✅ — gpt-image edit: ретраи раннего обрыва (фикс PIAPI_SYNC_LOST)

Симптом (прод, 12.06): «Фото в стиле 2к17» падает с `PIAPI_SYNC_LOST` («connection was lost and the task never appeared in provider history»), 316 секунд, $0.00, без taskId. Дашборд PiAPI подтверждает: задача 12.06 вообще не создавалась — последний gpt-image-2 успех был 11.06.

Точный разбор (по таймингам и дашборду PiAPI, без SSH на прод):

- 316с = ~16с на сам запрос + ровно 300с (5 мин) history recovery. То есть это снова знакомый РАННИЙ RST на ~15-й секунде multipart edits-запроса, ДО первого байта ответа.
- Ключевое наблюдение: PiAPI отвечает на edits только когда изображение готово (40–100с), а в LLM-истории дашборда `Создано == Обновлено` — запись появляется в момент завершения. Раз задача в истории так и не появилась, запрос не дошёл до бэкенда PiAPI вовсе: ничего не генерировалось и не биллилось.
- После перехода на стратегию «recovers through history» дефолт `PIAPI_GPT_IMAGE_EDIT_RETRIES` стал 1 — то есть ретраев НЕ БЫЛО вообще: ставка была на history recovery, но при раннем обрыве восстанавливать нечего (задачи не существует). Итог: один RST = 5 мин пустого recovery → PIAPI_SYNC_PENDING → ещё 10 мин reconciler → SYNC_LOST + refund. Хрупкость соединения не лечилась, а превращалась в 15-минутное зависание.
- Размер тела ни при чём: референс после нормализации был 310 KB (hard cap из P9.4.x), а обрыв всё равно случился. Доки PiAPI перепроверены: async/task-пути для gpt-image по-прежнему нет, edits — только multipart.

Фикс:

- `ProviderError` получил опциональную `meta` (транспортные детали для решений выше по стеку).
- `gptImageEditOnce` отслеживает `responseStarted` (первый байт ответа = запрос точно дошёл и обработан) и `elapsedMs`; кладёт их в `meta` ошибки.
- `gptImageEditViaHttps`: дефолт попыток — 4 (`PIAPI_GPT_IMAGE_EDIT_RETRIES` переопределяет), backoff 2с/5с/10с. Ретраится ТОЛЬКО ранний обрыв: connection-ошибка (ECONNRESET/EPIPE/hang up/ECONNREFUSED/ETIMEDOUT) + ответ не начался + прошло ≤30с. Поздний обрыв или наш таймаут НЕ ретраятся (генерация могла начаться и будет забиллена) — для них остаётся history recovery, как раньше.
- Если ВСЕ попытки оборвались рано, на ошибку вешается `meta.neverReachedProvider = true`, и `isRecoverableGptImageTransportError` возвращает false: проект сразу честно фейлится с refund (`PIAPI_NETWORK_ERROR`) вместо 15 минут на 95% и SYNC_LOST.
- `PIAPI_GPT_IMAGE_EDIT_RETRIES=4` задокументирован в `apps/worker/.env.example` и `infra/prod/.env.example`.

Осознанный риск: если ранний RST всё же случился ПОСЛЕ регистрации задачи у провайдера (не наблюдалось), ретрай создаст дубль-генерацию ~$0.03–0.10 за наш счёт; коины юзера не дублируются (одна job). Структурная причина обрывов — нестабильный путь RU ВМ → api.piapi.ai для долгих multipart-соединений (похоже на DPI/шлюз); если флапы участятся, кардинальное решение — зарубежный relay/proxy для PiAPI-трафика.

Проверки P9.4.5: `npm.cmd run build -w @allvision/worker` — зелёный; worker `piapi-client` — 12 passed (4 новых теста: ретрай раннего RST, neverReachedProvider после всех попыток, нет ретрая после начала ответа, нет ретрая таймаута); полный worker suite без DB-backed — 85 passed (pipeline-runner/piapi-provider требуют Postgres `localhost:5433`, локально не поднят).

## Этап P9.5 ✅ — Live-обновление UI, retry-кнопки, лимиты файлов, безопасные ретраи createTask

Задача 1 — «генерация завершилась, но UI не обновляется без F5». Корневая причина (универсальная для всех экранов): в Redux-store не вызывался `setupListeners`, и у RTK Query API не были включены `refetchOnFocus`/`refetchOnReconnect`. Когда юзер уходил на другую вкладку (например, на дашборд PiAPI), браузер тротлит фоновые таймеры — поллинг почти останавливался, а на возврат вкладки рефетча не было. Фикс:

- `apps/web/src/store/index.ts`: `setupListeners(store.dispatch)`.
- `refetchOnFocus: true` + `refetchOnReconnect: true` на `projectsApi` (services/studio/project-page), `userChatApi` (чат), `accountApi` и `authApi` (баланс/дашборд). Теперь фокус/реконнект форсят свежий запрос.
- ServiceDetail: поллинг списка генераций больше не привязан к активной вкладке. Введён `shouldPoll = hasActiveProject || launchStartedLock` (есть незавершённый проект ИЛИ только что запустили) → 3s polling, результат догоняет и на вкладке «Услуга».
- Studio history: добавлен 3s polling, пока есть `PENDING/PROCESSING` проект (раньше не поллился вовсе).
- Project-page и чат уже поллили по статусу — оставлены, но теперь дополнительно ловят возврат на вкладку.

Задача 2 — явная кнопка «Попробовать снова» при ошибке. Была пропущена только в ServiceDetail `GenerationCard` (показывался лишь warning). Добавлена кнопка, которая переключает на вкладку «Услуга» и скроллит к форме (значения формы сохраняются в стейте). На project-page, в Студии и чате retry уже был.

Задача 3a — явные лимиты файлов в UI + клиентская проверка размера (раньше для фото её не было — юзер ждал серверный reject):

- ServiceDetail: фото `JPG, PNG или WebP, до 15 МБ`, аудио `MP3, WAV или OGG, до 25 МБ` показываются прямо под зоной загрузки; при превышении — мгновенная ошибка, файл не принимается. Видео-лимит уже показывался. Лимиты не строже серверных multer-фильтров.
- Чат (`InputSourcePicker`): добавлена клиентская проверка 25 МБ (совпадает с `MAX_CHAT_INPUT_SIZE`), текст лимита там уже был.

Задача 3b — безопасные ретраи при обрыве «до старта генерации» для unified-моделей (nano-banana, kling, omni, seedance...). `PiAPIClient.fetchWithRetry` получил раздельные счётчики: `retries` (HTTP 5xx, ответ пришёл = запрос дошёл) и `connectionRetries` (transport-обрыв, fetch бросил, ОТВЕТА не было = задача не зарегистрирована, повтор безопасен). `createTask` теперь `{ retries: 1, connectionRetries: 3 }`: до 3 попыток ТОЛЬКО на transport-обрыв; HTTP-ответы и наш AbortController-таймаут не повторяются (задача могла создаться → не плодим дубль-генерации). gpt-image edit retry-логика (P9.4.5) не тронута. Списание коинов остаётся одно на job, refund на FAILED — ретраи внутри одной job, дублей запросов/списаний нет.

Проверки P9.5: `npm.cmd run build -w @allvision/worker` и `-w @allvision/web` — зелёные; worker `piapi-client` — 14 passed (2 новых теста: retry createTask на transport-обрыв, НЕ retry на HTTP 5xx); полный worker suite без DB-backed — 87 passed (pipeline-runner/piapi-provider требуют Postgres `localhost:5433`, локально не поднят).

## Этап P9.6 ✅ — Формат кадра (aspect ratio): omni следует загруженной сцене, а не форсит 16:9

Симптом: видео-генерации (cinema/scene-transfer на Kling 3.0 / Seedance Omni) выходили в 16:9 независимо от выбранного формата.

Корневая причина: в `buildTextToVideoPayload` для omni-веток (`kling-3-omni`, `seedance-*-omni`) формат шёл через `providerAspectRatio(value, fallback='16:9')` — любой `auto`/пусто превращался в жёсткие 16:9. Это отличалось от `image-to-video` Kling, который при неизвестном формате ОПУСКАЕТ `aspect_ratio` и даёт модели взять формат из референса. У omni референс (загруженный кадр/видео сцены) есть всегда, но его формат игнорировался.

Фикс (worker, доезжает на прод):

- Добавлен `explicitAspectRatio(value)` — возвращает формат только при явном выборе юзера (не `auto`/пусто).
- В omni-ветках `buildTextToVideoPayload` (`kling-3-omni` и seedance при `mode='omni_reference'`/`-omni`) `aspect_ratio` теперь отправляется ТОЛЬКО при явном выборе; при `auto` поле опускается → модель берёт формат из загруженной сцены. Для чистого text-to-video без референсов (seedance text_to_video, veo, sora, wan, hailuo) сохранён дефолт 16:9 через `providerAspectRatio`.
- `scene-transfer` runSeedance: дефолт `'9:16'` → `'auto'` (согласовано с runKling), чтобы при «авто» формат брался из сцены, а не хардкодился.

Поведение по контракту юзера: если в форме есть поле формата и юзер выбрал конкретный (9:16/16:9/1:1...) — он и уходит в PiAPI; если выбрал «Авто» или поля формата нет (`{{user.aspect}}` → undefined → auto) — omni следует загруженной сцене, чистый t2v дефолтит 16:9.

Долг/прод-нюанс: дефолт поля «Формат кадра» у уже существующих cinema-услуг (`me-in-movie`, `me-in-cartoon`, `me-in-harry-potter`, `kid-in-blue-tractor`) в seed остался прежним (`16:9`/`9:16`). Эти услуги НЕ в `NEW_SERVICE_SLUGS_TO_CREATE`, поэтому seed их не обновляет — менять дефолт на «Авто» нужно в `/admin/services`, если хочется чтобы по умолчанию формат брался из сцены. Сам выбор «Авто» уже работает корректно благодаря worker-фиксу. gpt-image услуги (`road-camera-couple`, `single-photo-2017`) не тронуты: им нужен конкретный размер через `gptImageSizeForAspect`.

Проверки P9.6: worker `piapi-payloads scene-transfer-block` — 24 passed (3 новых теста: omit aspect при auto для Kling/Seedance omni, явный выбор сохраняется, pure t2v дефолтит 16:9); `npm.cmd run build -w @allvision/worker` — зелёный.

## Этап P9.7 ✅ — Все услуги уходят с gpt-image-2 на nano-banana (надёжность)

Диагностика по проду (SSH, чтение БД/логов): падает РОВНО `gpt-image-2`. За 14 дней — 17 success / 16 failed / 3 timeout_pending ≈ **47% фейлов**. Все падения — `ECONNRESET` на синхронном multipart `/v1/images/edits` (RU ВМ → api.piapi.ai рвёт долгое соединение, DPI/шлюз). Async-модели (nano-banana, seedance, sora, kling) надёжны: не-gpt падения — это легитимный `CONTENT_MODERATION`. Reconciler корректно фейлит зависшие SYNC_PENDING через 10 мин и возвращает коины (проверено: refund есть), но UX — 10–15 мин на 95% перед фейлом.

Решение (по согласованию с владельцем): все услуги переведены с `gpt-image-2` на `nano-banana` (Gemini, async task API). Доки PiAPI: nano-banana-2 resolution `1K/2K/4K` (макс 4K), aspect_ratio поддерживает 1:1/3:4/9:16/16:9/auto, image-to-image есть. nano-banana и надёжнее, и дешевле ($0.06–0.12 vs $0.10 + брак).

Прод-БД (изменено вручную через psql, т.к. услуги не в seed-allowlist и seed их не перезаписывает):

- 8 услуг переведены `gpt-image-2` → `nano-banana`: `single-photo-2017`, `group-photo-2017`, `group-photo-2017-copy-copy`, `last-kiss-meteor-copy`, `road-camera-couple`, `carousel-post`, `product-cover`, `product-card`. Бэкап pipelineConfig сохранён в `shared/pipeline-backup-*.tsv`.
- Фото-услуги (image-edit) получили `resolution: '4K'` (наилучшее качество).
- `single-photo-2017`: пофикшен **захардкоженный** `aspect_ratio: '16:9'` → `'{{user.aspect}}'` — это была причина «формат не меняется» на флагмане (поле `aspect` есть, дефолт 3:4, но в пайплайн уходило 16:9).

Код (доедет деплоем):

- `carousel-slides` и `product-card`: дефолт модели `gpt-image-2` → `nano-banana`; cover/слайды получили `resolution: '2K'` (раньше дефолтили в 1K, без качества).
- `PIAPI_GPT_IMAGE_HISTORY_RECOVERY_MS` дефолт 5мин → 2мин: при потере gpt-image edit (остаточный путь в Студии/чате-бете) worker не держит concurrency=1 пять минут впустую и UI не висит так долго.
- Seed-источник: все `gpt-image-2` → `nano-banana`, фото-услуги `resolution: '4K'` (для свежих установок; прод управляется в админке).

Aspect с nano-banana проверен по коду: `buildImageEditPayload` шлёт `aspect_ratio` при явном выборе и опускает при `auto` (тогда следует входному изображению) — формат юзера (9:16/16:9/1:1/3:4) уходит корректно.

UI-зависание: основная причина (услуги сайта на gpt-image → путь SYNC_PENDING) устранена — nano-banana падает/завершается быстро, без 5-мин recovery и 10-мин reconciler. Остаточный gpt-image только в Студии/чате (бета, опционально); для него ужат recovery-таймаут.

Прод-env (`PIAPI_SYNC_PENDING_FAIL_AFTER_MS=600000`) НЕ менялся (не дал авто-классификатор как ручную правку прод-конфига); при желании можно опустить в `shared/.env` до ~120000 для ещё более быстрого фейла остаточного gpt-image.

Проверки P9.7: `npm.cmd run build -w @allvision/database -w @allvision/worker` — зелёные; worker `carousel-slides product-card blocks-registry piapi-payloads` — 26 passed. Seed-тест локально падает на устаревшем Prisma-клиенте (`stylePreset is not a function`, известный Windows EPERM на `prisma generate`), не связано с правками.

## Этап P9.8 ✅ — Cinema-режимы, стартовый баланс 0, фикс карусели

**Задача 1 — «Я в фильме» / «Я в мультфильме»: режим фото/видео → промпт(дефолт)/фото.**
На проде эти услуги остались на старом конфиге (`scene_mode: photo|video`), хотя seed-источник уже был переделан на правильный дизайн (`generation_mode: prompt|photo`, без видео). Причина: услуги не в `NEW_SERVICE_SLUGS_TO_CREATE`, поэтому seed их не перезаписывает на деплое. Блок `scene-transfer` уже умеет `generation_mode`. Привёл прод к seed-версии: сгенерировал SQL из `giftFactoryServices` (точное соответствие, без ручного перевода) и применил через psql (`infra/prod/cinema-mode-fix.sql`, бэкап `shared/cinema-backup-*.tsv`).
- `me-in-movie`: `generation_mode` (По промпту — дефолт / По фото), `person1` опционален, `scene_photo` виден в фото-режиме, `prompt` обязателен в промпт-режиме. Промпт-режим → Seedance 2.0 t2v, фото-режим → Kling 3.0 оживляет кадр. Видео-режим убран.
- `me-in-cartoon`: то же + `cartoon_visual_mode` (дефолт **`realistic`** — «максимально реалистичный перенос персонажа в мультмир») и `cartoon_style` (5 стилей). Блок резолвит `cartoon_visual_mode={{user.cartoon_visual_mode}}`.
Seed уже корректен — менять не пришлось. Фронт data-driven (visibleWhen/requiredWhen, select), деплой не требуется.

**Задача 2 — стартовый баланс 25 → 0.**
- `auth-service.ts`: дефолт `WELCOME_TOKENS_BONUS ?? 25` → `?? 0`; при 0 транзакция `welcome_bonus` не создаётся.
- `.env.example`, `infra/prod/.env.example`: `WELCOME_TOKENS_BONUS=0`. Прод `shared/.env` правится операционно (было 25).
- UI: `HeroSection` убрал «25 токенов после регистрации» и CTA «Создать первый бесплатно» → «Создать подарок»; `CTASection` тот же CTA.
- Тесты: `auth.test.ts` (баланс 0, нет транзакций), `account.test.ts` (вместо welcome_bonus — ручная `topup`-транзакция).

**Задача 3 — карусель: «1 картинка вместо 5» + переделка качества.**
Корневой баг: каждый слайд `provider.imageEdit` писал в один путь `outputs/.../{stepId}/result.jpg` (stepId одинаковый для всех слайдов блока) → слайды перезаписывали друг друга, и все 5 `resultAssets` указывали на один файл (5 копий последнего). Подтверждено на проде: `resultAssets` = 5 одинаковых URL. Фикс: уникальный `stepId` на слайд (`{stepId}-slide-N`) через расширенный `scaledContext`. Тот же баг был в `product-card` (animation/ad оба `result.mp4`) — тоже исправлен (`{stepId}-cover|animation|ad`).
Промпт слайда переписан по фидбэку: человек как чистая PNG-вырезка без фона сбоку (не в рамке/карточке), дизайнерский фон во весь кадр, сильная современная типографика (жирный заголовок + читаемый текст), высокое качество фото/кожи/ткани, одежда сохраняется, единый шаблон по всем слайдам. Дефолт resolution слайдов/обложки поднят на 2K.

Технический долг P9.8: точный рендер текста на слайдах — слабое место nano-banana; на будущее overlay текста через ffmpeg/canvas. Прод-env `WELCOME_TOKENS_BONUS` и рестарт api — операционно.

Проверки P9.8: `npm.cmd run build -w @allvision/worker -w @allvision/api -w @allvision/web` — зелёные; worker `carousel-slides product-card blocks-registry` — 11 passed. API-тесты (auth/account) требуют Postgres `localhost:5433`, локально не гоняются.

## Этап P10 ✅ — SEO: технический фундамент, мета, структурированные данные

Аудит выявил: в коде был зашит чужой домен `allvision.studio` (реальный — `allvision-pulse.ru`) в `layout` metadataBase/OG и `sitemap` → битые canonical/OG/карта сайта; не было `robots.txt`; страницы услуг отдавали сырой slug в title («Услуга single-photo-2017»); sitemap брал статический legacy-список вместо реальных услуг; не было JSON-LD и canonical.

Сделано (фазы 1–3):
- `apps/web/src/lib/seo.ts` — единый `SITE_URL` (env `NEXT_PUBLIC_SITE_URL`, дефолт `https://allvision-pulse.ru`), `pageMetadata()` (canonical+OG+Twitter), `PUBLIC_API_URL` для серверных fetch.
- `layout.tsx`: metadataBase/OG на правильный домен, дефолтные keywords, `verification.yandex/google` из env (опускаются, если пусто), googleBot директивы.
- `robots.ts` (новый): открыта витрина, закрыты `/dashboard /admin /ai /studio /profile /api /mock-payment` и auth; sitemap+host.
- `sitemap.ts`: реальный домен + услуги из `/api/services`, тренды, сценарии, статические страницы.
- `services/[slug]/page.tsx`: `async generateMetadata` тянет услугу из `/api/services/:slug` → настоящие title/description/OG/canonical; раньше был сырой slug.
- Мета через `pageMetadata` на главной, services, pricing, trends, about, contacts, scenarios (для client-страницы scenarios добавлен `scenarios/layout.tsx`).
- JSON-LD: `components/seo/JsonLd.tsx` + `lib/structured-data.ts` — Organization+WebSite(SearchAction)+FAQPage на главной (FAQ из `landingFaqs`), Service+Offer (цена в RUB, 1 коин≈1₽) и BreadcrumbList на страницах услуг.
- Dockerfile.prod/compose: build-args `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_YANDEX_VERIFICATION`, `NEXT_PUBLIC_GOOGLE_VERIFICATION` (NEXT_PUBLIC инлайнятся при сборке web). env-примеры обновлены.
- `docs/SEO.md` — пошаговая инструкция по Яндекс.Вебмастер (приоритет РФ) + Google Search Console + Метрика, способы верификации (DNS TXT рекомендуется — без пересборки; либо мета-тег через env+ребилд, либо HTML-файл в `public/`).

Долг (фазы 4–5): подключить аккаунты вебмастеров и Метрику (у владельца их пока нет), заменить picsum-превью на брендовые ассеты, контент под long-tail.

Проверки P10: `npm.cmd run build -w @allvision/web` — зелёный; `/robots.txt` и `/sitemap.xml` генерируются, `/services/[slug]` стал dynamic (async-мета). Домен в дефолте корректен даже без прод-env.

## Этап P10.1 ✅ — Фикс реконсайлера (фото вместо видео) + промпт «стадиона»

Задача: услуга «Случайный кадр со стадиона» (`last-kiss-meteor-copy`, пайплайн image-edit → text-to-video → video-compose) иногда возвращала фото вместо видео, хотя видео-генерация выполнялась.

Корень (по проду): не интермиттентность генерации, а **гонка PiAPI-реконсайлера**. У упавшего проекта: step_3 (image-edit) `completed` → картинка, step_1 (text-to-video) остался `processing`, step_2 pending, но проект помечен COMPLETED с resultImage = картинка первого шага. Воркер прервался деплоем mid-pipeline; реконсайлер в `recoverPiAPIProject` перебирал refs (AIUsageLog с taskId + aiProviderJobId) и финализировал проект по ПЕРВОМУ завершённому рефу — а это была уже потреблённая картинка image-edit, не активный видео-шаг.

Фикс (`apps/api/src/services/piapi-recovery-service.ts`): добавлен `isConsumedIntermediateStep()` — реф пропускается, если его шаг в `stepProgress` уже `completed` И не является последним шагом пайплайна. Так реконсайлер больше не закрывает многошаговый проект промежуточным результатом; берётся активный/финальный шаг. Для одношаговых gpt-image (SYNC_PENDING) поведение не меняется (единственный шаг = последний).

Промпт/модель (прод-БД, `infra/prod/stadium-prompt-fix.sql`): модель кадра `flux-schnell`(txt2img, игнорировал фото юзера) → `nano-banana` (берёт фото). Промпты image-edit и text-to-video переписаны: спокойный, милый, чуть стервозный/невозмутимый взгляд (не радость/не активная поддержка), кадр телетрансляции с сильным зумом ИЗДАЛЕКА (компрессия телевика, размытая толпа, как оператор приблизил с другого конца стадиона), а не съёмка вблизи/селфи.

Про-длительностное ценообразование (задача из того же запроса): уже полностью реализовано и задеплоено (`610996e`) — админ-форма даёт цену на каждую длительность (`durationPrices`), сервер списывает `selectedDurationPrice` при наличии, иначе цену тира. Модельная себестоимость из реестра на списание НЕ влияет (только калькулятор маржи, подписана «Себестоимость»). Кода не требовалось; ни у одной услуги `durationPrices` пока не заполнены.

Проверки P10.1: `npm.cmd run build -w @allvision/api` — зелёный.
